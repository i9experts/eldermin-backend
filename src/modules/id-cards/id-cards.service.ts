// ============================================================
// ID CARD SERVICE — Eldermin ERP | NestJS
// Purpose-built printable ID card designer + batch generator for
// students and staff. See id-card-template.schema.ts for why this is a
// separate engine from ReportTemplate rather than reusing it.
// ============================================================

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as QRCode from 'qrcode';
import * as bwipjs from 'bwip-js';
import { PdfService } from '../../pdf/pdf.service';
import {
  IdCardTemplate, IdCardTemplateDocument, STUDENT_ID_CARD_FIELDS, STAFF_ID_CARD_FIELDS,
} from './schemas/id-card-template.schema';
import { CreateIdCardTemplateDto, UpdateIdCardTemplateDto } from './dto/id-card.dto';
import { Campus } from '../../organization/schemas/organization.schema';
import { GroupInstitution } from '../../organization/schemas/group-institution.schema';

// CR80 - the real, standard physical ID card size (credit-card sized),
// used worldwide for student/staff/membership cards. Landscape, in mm.
const CARD_WIDTH_MM = 85.6;
const CARD_HEIGHT_MM = 54;
const CARD_GAP_MM = 5;
const PAGE_MARGIN_MM = 10;
const CARDS_PER_ROW = 2;
const CARDS_PER_COL = 4; // 8 cards per A4 sheet, a real, printable layout

@Injectable()
export class IdCardsService {
  constructor(
    @InjectModel(IdCardTemplate.name) private templateModel: Model<IdCardTemplateDocument>,
    @InjectModel('Student') private studentModel: Model<any>,
    @InjectModel('Staff') private staffModel: Model<any>,
    @InjectModel('School') private schoolModel: Model<any>,
    @InjectModel(Campus.name) private campusModel: Model<any>,
    @InjectModel(GroupInstitution.name) private institutionModel: Model<any>,
    private readonly pdfService: PdfService,
  ) {}

  // ── Templates CRUD ──────────────────────────────────────────
  async listTemplates(schoolSlug: string, entityType?: string) {
    const filter: any = { schoolSlug };
    if (entityType) filter.entityType = entityType;
    return this.templateModel.find(filter).sort({ isDefault: -1, createdAt: -1 }).lean();
  }

  async createTemplate(schoolSlug: string, createdBy: string, dto: CreateIdCardTemplateDto) {
    const validKeys = dto.entityType === 'staff' ? STAFF_ID_CARD_FIELDS : STUDENT_ID_CARD_FIELDS;
    const showFields = (dto.showFields || []).filter((f) => (validKeys as readonly string[]).includes(f));
    const isFirst = (await this.templateModel.countDocuments({ schoolSlug, entityType: dto.entityType })) === 0;
    const template = new this.templateModel({ ...dto, showFields, schoolSlug, createdBy, isDefault: isFirst });
    return template.save();
  }

  async updateTemplate(id: string, schoolSlug: string, dto: UpdateIdCardTemplateDto) {
    const existing = await this.templateModel.findOne({ _id: id, schoolSlug });
    if (!existing) throw new NotFoundException('ID card template not found.');
    if (dto.showFields) {
      const validKeys = existing.entityType === 'staff' ? STAFF_ID_CARD_FIELDS : STUDENT_ID_CARD_FIELDS;
      dto.showFields = dto.showFields.filter((f) => (validKeys as readonly string[]).includes(f));
    }
    Object.assign(existing, dto);
    return existing.save();
  }

  async deleteTemplate(id: string, schoolSlug: string) {
    const template = await this.templateModel.findOne({ _id: id, schoolSlug });
    if (!template) throw new NotFoundException('ID card template not found.');
    if (template.isDefault) {
      throw new BadRequestException('Cannot delete the default template - set another template as default first.');
    }
    await template.deleteOne();
    return { message: 'Template deleted.' };
  }

  async setDefaultTemplate(id: string, schoolSlug: string) {
    const template = await this.templateModel.findOne({ _id: id, schoolSlug });
    if (!template) throw new NotFoundException('ID card template not found.');
    await this.templateModel.updateMany(
      { schoolSlug, entityType: template.entityType, _id: { $ne: id } },
      { $set: { isDefault: false } },
    );
    template.isDefault = true;
    await template.save();
    return template;
  }

  // ── School branding (same institution/campus logo-tracing pattern
  // used by generateGrRegisterPdf / generateExamPaperPdf) ────────────
  // Resolves per campusId rather than once for the whole batch - a mixed-
  // campus print run (e.g. "By Campus" scope run against "All Campuses")
  // previously stamped EVERY card with whichever campus happened to be
  // first in the query result. Called through a small cache in
  // generateIdCardsPdf so a same-campus batch (the common case) still
  // only hits the DB once per unique campus, not once per student.
  private async resolveBranding(schoolSlug: string, campusId?: any): Promise<{ name: string; logo: string; phone: string; campusName: string }> {
    const school: any = await this.schoolModel.findOne({ slug: schoolSlug }).lean();
    let institutionName: string | undefined, institutionLogo: string | undefined;
    let campusName = '', campusPhone = '';
    if (campusId) {
      const campus: any = await this.campusModel.findOne({ _id: campusId, schoolSlug }).lean();
      campusName = campus?.name || '';
      campusPhone = campus?.phone || '';
      if (campus?.institutionId) {
        const inst: any = await this.institutionModel.findOne({ _id: campus.institutionId, schoolSlug }).lean();
        institutionName = inst?.name; institutionLogo = inst?.logoUrl;
      }
    }
    return {
      name: institutionName || school?.name || 'School',
      logo: institutionLogo || school?.logo || '',
      phone: campusPhone || school?.phone || '',
      campusName,
    };
  }

  private escapeHtml(text: any): string {
    if (text === undefined || text === null) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private fmtDate(d: any) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // Normalizes a raw Student or Staff document into one flat shape the
  // card renderer can treat identically regardless of entity type.
  // `campusName` is resolved by the caller (generateIdCardsPdf) via its
  // per-campus branding cache, since a Student only stores a campusId,
  // not a denormalized campus name.
  private mapEntity(entityType: string, doc: any, campusName: string) {
    if (entityType === 'staff') {
      const emergency = doc.contact?.emergency;
      return {
        id: String(doc._id),
        photo: doc.avatarUrl || '',
        name: `${doc.firstName || ''} ${doc.lastName || ''}`.trim(),
        idNumber: doc.employeeId || '',
        idLabel: 'Employee ID',
        subtitle: [doc.designation, doc.department].filter(Boolean).join(' · '),
        dob: this.fmtDate(doc.dateOfBirth),
        bloodGroup: doc.personal?.bloodGroup || '',
        address: [doc.address?.street, doc.address?.city].filter(Boolean).join(', '),
        phone: doc.phone || emergency?.phone || '',
        joiningDate: this.fmtDate(doc.dateOfJoining),
        email: doc.email || '',
        fatherName: doc.fatherName || '',
        campus: doc.campus || campusName || '',
        verifyCode: `STAFF:${doc.employeeId || doc._id}`,
      };
    }
    const father = (doc.guardians || []).find((g: any) => g.relation === 'father');
    const primaryGuardian = (doc.guardians || []).find((g: any) => g.isPrimary) || father || (doc.guardians || [])[0];
    const guardianPhone = (doc.guardians || []).map((g: any) => g.phone).filter(Boolean)[0] || '';
    const emergencyContact = [doc.emergencyContactName, doc.emergencyContactPhone].filter(Boolean).join(' - ');
    return {
      id: String(doc._id),
      photo: doc.photo || '',
      name: `${doc.firstName || ''} ${doc.lastName || ''}`.trim(),
      idNumber: doc.grNo || doc.admissionNumber || '',
      idLabel: doc.grNo ? 'GR #' : 'Admission #',
      subtitle: [doc.currentGrade, doc.currentSection].filter(Boolean).join(' - '),
      dob: this.fmtDate(doc.dateOfBirth),
      bloodGroup: doc.medical?.bloodGroup || '',
      address: doc.address || '',
      guardianContact: guardianPhone || '',
      guardianName: primaryGuardian ? `${primaryGuardian.name || ''}${primaryGuardian.relation ? ` (${primaryGuardian.relation})` : ''}`.trim() : '',
      campus: campusName || '',
      academicYear: doc.currentAcademicYear || '',
      admissionDate: this.fmtDate(doc.admissionDate),
      religion: doc.religion || '',
      nationality: doc.nationality || '',
      emergencyContact: emergencyContact || '',
      verifyCode: `STUDENT:${doc.grNo || doc.admissionNumber || doc._id}`,
    };
  }

  private cardCss(layoutStyle: string, primary: string, accent: string): string {
    const base = `
      .card { position: relative; width: ${CARD_WIDTH_MM}mm; height: ${CARD_HEIGHT_MM}mm;
        border: 0.5px dashed #bbb; border-radius: 3mm; overflow: hidden; background: #fff;
        font-family: Arial, Helvetica, sans-serif; box-sizing: border-box; }
      .card * { box-sizing: border-box; }
      .photo { border-radius: 2mm; object-fit: cover; background: #e5e7eb; }
      .photo-fallback { display: flex; align-items: center; justify-content: center;
        background: #e5e7eb; color: #9ca3af; font-weight: bold; }
      .name { font-weight: bold; color: #111; line-height: 1.15; }
      .subtitle { color: #444; }
      .field-row { display: flex; gap: 1mm; color: #333; }
      .field-label { color: #888; }
      .qr { background: #fff; }
      .sig-line { border-top: 0.3mm solid #999; }
      .accent-bar { position: absolute; bottom: 0; left: 0; right: 0; height: 1.5mm; background: ${accent}; }
      .reg-badge { position: absolute; top: 2mm; left: 2mm; background: rgba(255,255,255,0.92);
        color: ${primary}; font-size: 5.5pt; font-weight: bold; padding: 0.6mm 1.8mm;
        border-radius: 1mm; z-index: 3; letter-spacing: 0.2pt; }
    `;
    if (layoutStyle === 'modern') {
      return base + `
        .card-header { background: linear-gradient(135deg, ${primary}, ${accent}); height: 14mm;
          display: flex; align-items: center; padding: 0 3mm; }
        .card-header .school-name { color: #fff; font-weight: bold; font-size: 8.5pt; }
        .photo { width: 18mm; height: 18mm; border-radius: 50%; border: 0.6mm solid #fff;
          position: absolute; top: 7mm; left: 3.5mm; z-index: 2; }
        .photo-fallback { width: 18mm; height: 18mm; border-radius: 50%; font-size: 14pt; }
        .card-body { padding: 12mm 3mm 2mm 24mm; }
        .name { font-size: 10pt; }
        .subtitle { font-size: 7.5pt; margin-top: 0.5mm; }
        .field-row { font-size: 6.5pt; margin-top: 0.8mm; }
      `;
    }
    if (layoutStyle === 'minimal') {
      return base + `
        .card-header { display: flex; align-items: center; gap: 2mm; padding: 2.5mm 3mm 1mm;
          border-bottom: 0.4mm solid ${primary}; }
        .card-header .school-name { color: ${primary}; font-weight: bold; font-size: 7.5pt; }
        .card-header img.logo { height: 6mm; width: auto; }
        .card-body { display: flex; gap: 2.5mm; padding: 2mm 3mm; }
        .photo { width: 16mm; height: 20mm; }
        .photo-fallback { width: 16mm; height: 20mm; font-size: 12pt; }
        .name { font-size: 9pt; }
        .subtitle { font-size: 7pt; color: ${primary}; margin-top: 0.5mm; }
        .field-row { font-size: 6.5pt; margin-top: 0.7mm; }
      `;
    }
    if (layoutStyle === 'vibrant') {
      return base + `
        .card-header { background: linear-gradient(90deg, ${primary}, ${accent}); height: 15mm;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 1mm 3mm; text-align: center; }
        .card-header .school-name { color: #fff; font-weight: bold; font-size: 8pt;
          letter-spacing: 0.3pt; text-transform: uppercase; }
        .card-header .school-tagline { color: rgba(255,255,255,0.85); font-size: 5.5pt; margin-top: 0.4mm; }
        .photo { width: 16mm; height: 16mm; border-radius: 50%; border: 0.7mm solid #fff;
          position: absolute; top: 17mm; left: 3.5mm; z-index: 2; box-shadow: 0 0 0 0.25mm ${primary}; }
        .photo-fallback { width: 16mm; height: 16mm; border-radius: 50%; font-size: 12pt; }
        .card-body { padding: 5mm 3mm 3mm 21mm; }
        .name { font-size: 9.5pt; }
        .subtitle { font-size: 7pt; color: ${primary}; margin-top: 0.5mm; font-weight: 600; }
        .field-row { font-size: 6.5pt; margin-top: 0.7mm; }
        .field-label { color: ${primary}; font-weight: bold; }
        .accent-bar { height: 2mm; }
      `;
    }
    // classic
    return base + `
      .card-header { background: ${primary}; height: 10mm; display: flex; align-items: center;
        gap: 1.5mm; padding: 0 3mm; }
      .card-header img.logo { height: 6.5mm; width: auto; background: #fff; border-radius: 1mm; padding: 0.3mm; }
      .card-header .school-name { color: #fff; font-weight: bold; font-size: 8pt; }
      .card-body { display: flex; gap: 2.5mm; padding: 2.5mm 3mm; }
      .photo { width: 17mm; height: 21mm; }
      .photo-fallback { width: 17mm; height: 21mm; font-size: 13pt; }
      .name { font-size: 9.5pt; }
      .subtitle { font-size: 7.5pt; color: ${primary}; margin-top: 0.5mm; }
      .field-row { font-size: 6.5pt; margin-top: 0.8mm; }
    `;
  }

  // Long-form fields that make sense on the back only (student side) -
  // short fields (dob, blood group, phone, joining date) already fit
  // comfortably on the front, so they're not repeated here.
  private static readonly BACK_ONLY_FIELDS = [
    'address', 'guardianContact', 'guardianName', 'campus', 'academicYear', 'admissionDate', 'religion', 'nationality', 'emergencyContact',
  ];

  private async buildCardFace(
    person: any, side: 'front' | 'back', template: IdCardTemplateDocument,
    branding: { name: string; logo: string; phone: string },
    fieldLabels: Record<string, string>,
  ): Promise<string> {
    const initials = person.name.split(' ').filter(Boolean).slice(0, 2).map((w: string) => w[0]).join('').toUpperCase() || '?';
    const photoHtml = person.photo
      ? `<img class="photo" src="${this.escapeHtml(person.photo)}" />`
      : `<div class="photo photo-fallback">${initials}</div>`;

    let qrHtml = '';
    if (template.showQrCode && side === 'front') {
      const qrDataUrl = await QRCode.toDataURL(person.verifyCode, { width: 80, margin: 0 });
      qrHtml = `<img class="qr" src="${qrDataUrl}" style="width:12mm;height:12mm;position:absolute;bottom:2mm;right:2.5mm;" />`;
    }
    let barcodeHtml = '';
    if (template.showBarcode && side === 'front') {
      try {
        const buf = await bwipjs.toBuffer({ bcid: 'code128', text: person.idNumber || person.id, scale: 1.5, height: 6, includetext: false });
        barcodeHtml = `<img src="data:image/png;base64,${buf.toString('base64')}" style="position:absolute;bottom:1mm;left:3mm;width:30mm;height:6mm;" />`;
      } catch { /* non-fatal - card still identifies via QR/name */ }
    }
    const regBadgeHtml = template.layoutStyle === 'vibrant'
      ? `<div class="reg-badge">${this.escapeHtml(person.idLabel)}: ${this.escapeHtml(person.idNumber)}</div>`
      : '';

    if (side === 'back') {
      // Two-column back: field list on the left, free-text notes +
      // helpline on the right, matching the reference card's
      // "Authorised Center Address | Note" layout.
      const backFields = (template.showFields || []).filter((f) => IdCardsService.BACK_ONLY_FIELDS.includes(f));
      return `
        <div class="card" style="padding: 3mm;">
          <p style="font-size:7pt; font-weight:bold; color:${template.primaryColor}; margin:0 0 1.5mm;">${this.escapeHtml(branding.name)}</p>
          <div style="display:flex; gap:3mm; height: calc(100% - 5mm);">
            <div style="flex:1; min-width:0;">
              ${backFields.map((f) => `<div class="field-row"><span class="field-label">${fieldLabels[f] || f}:</span> <span>${this.escapeHtml((person as any)[f] || '—')}</span></div>`).join('')}
              ${template.validityText ? `<div class="field-row" style="margin-top:1.5mm;"><span class="field-label">Validity:</span> <span>${this.escapeHtml(template.validityText)}</span></div>` : ''}
            </div>
            <div style="flex:1; min-width:0; border-left: 0.3mm solid #ddd; padding-left:3mm;">
              ${template.noteText ? `<p style="font-size:6pt; font-weight:bold; color:#888; margin:0 0 0.8mm;">Note</p><p style="font-size:6pt; color:#333; margin:0; white-space:pre-line;">${this.escapeHtml(template.noteText)}</p>` : ''}
              ${branding.phone ? `<p style="font-size:6.5pt; margin:${template.noteText ? '2mm' : '0'} 0 0;"><span class="field-label">Helpline:</span> ${this.escapeHtml(branding.phone)}</p>` : ''}
            </div>
          </div>
          ${template.showSignatureLine ? `<div style="position:absolute; bottom:3mm; left:3mm; right:3mm;"><div class="sig-line" style="width:35mm; margin-left:auto;"></div><p style="font-size:6pt; text-align:right; margin:0.5mm 0 0; color:#888;">Authorized Signatory</p></div>` : ''}
        </div>
      `;
    }

    const logoHtml = branding.logo ? `<img class="logo" src="${this.escapeHtml(branding.logo)}" />` : '';
    const frontFields = (template.showFields || []).filter((f) => !IdCardsService.BACK_ONLY_FIELDS.includes(f));
    return `
      <div class="card">
        ${regBadgeHtml}
        <div class="card-header">${logoHtml}<span class="school-name">${this.escapeHtml(branding.name)}</span></div>
        <div class="card-body">
          ${photoHtml}
          <div style="flex:1; min-width:0;">
            <p class="name">${this.escapeHtml(person.name)}</p>
            <p class="subtitle">${this.escapeHtml(person.subtitle)}</p>
            <div class="field-row"><span class="field-label">${person.idLabel}:</span> <span>${this.escapeHtml(person.idNumber)}</span></div>
            ${frontFields.map((f) => `<div class="field-row"><span class="field-label">${fieldLabels[f] || f}:</span> <span>${this.escapeHtml((person as any)[f] || '—')}</span></div>`).join('')}
          </div>
        </div>
        ${qrHtml}${barcodeHtml}
        <div class="accent-bar"></div>
      </div>
    `;
  }

  // ── Batch generation ─────────────────────────────────────────
  async generateIdCardsPdf(
    schoolSlug: string,
    tenantId: string | undefined,
    entityType: string,
    ids: string[],
    templateId: string | undefined,
    includeBack: boolean,
  ): Promise<Buffer> {
    let template: IdCardTemplateDocument | null = templateId
      ? await this.templateModel.findOne({ _id: templateId, schoolSlug, entityType })
      : await this.templateModel.findOne({ schoolSlug, entityType, isDefault: true });
    if (!template) template = await this.templateModel.findOne({ schoolSlug, entityType });
    if (!template) throw new BadRequestException(`No ID card template exists yet for ${entityType}s - create one first.`);

    let rawEntities: any[];
    if (entityType === 'staff') {
      if (!tenantId) throw new BadRequestException('Missing tenant context for staff ID cards.');
      rawEntities = await this.staffModel.find({ tenantId, _id: { $in: ids } }).lean();
    } else {
      rawEntities = await this.studentModel.find({ schoolSlug, _id: { $in: ids } }).lean();
    }
    if (rawEntities.length === 0) throw new BadRequestException('None of the selected records were found.');

    // Per-campus branding cache - a mixed-campus batch (e.g. "All Campuses"
    // scope) must stamp each card with ITS OWN campus's branding, not
    // whichever campus happened to be first in the query result.
    const brandingCache = new Map<string, { name: string; logo: string; phone: string; campusName: string }>();
    const brandingFor = async (campusId: any) => {
      const key = campusId ? String(campusId) : '';
      if (!brandingCache.has(key)) {
        brandingCache.set(key, await this.resolveBranding(schoolSlug, campusId));
      }
      return brandingCache.get(key)!;
    };
    const people = await Promise.all(rawEntities.map(async (d) => {
      const b = await brandingFor(d.campusId);
      return { entity: d, person: this.mapEntity(entityType, d, b.campusName), branding: b };
    }));
    const fieldLabels: Record<string, string> = {
      dob: 'DOB', bloodGroup: 'Blood Group', address: 'Address', guardianContact: 'Guardian Contact',
      phone: 'Phone', joiningDate: 'Joined', guardianName: 'Guardian', campus: 'Campus',
      academicYear: 'Academic Year', admissionDate: 'Admission Date', religion: 'Religion',
      nationality: 'Nationality', emergencyContact: 'Emergency Contact', email: 'Email', fatherName: "Father's Name",
    };

    const positions: { x: number; y: number }[] = [];
    for (let r = 0; r < CARDS_PER_COL; r++) {
      for (let c = 0; c < CARDS_PER_ROW; c++) {
        positions.push({
          x: PAGE_MARGIN_MM + c * (CARD_WIDTH_MM + CARD_GAP_MM),
          y: PAGE_MARGIN_MM + r * (CARD_HEIGHT_MM + CARD_GAP_MM),
        });
      }
    }
    const perPage = positions.length;

    const buildSheetsHtml = async (side: 'front' | 'back') => {
      const pagesHtml: string[] = [];
      for (let i = 0; i < people.length; i += perPage) {
        const batch = people.slice(i, i + perPage);
        const cardsHtml = await Promise.all(batch.map((entry, idx) => {
          const pos = positions[idx];
          return this.buildCardFace(entry.person, side, template!, entry.branding, fieldLabels).then(
            (html) => `<div style="position:absolute; left:${pos.x}mm; top:${pos.y}mm;">${html}</div>`,
          );
        }));
        pagesHtml.push(`<div class="sheet">${cardsHtml.join('')}</div>`);
      }
      return pagesHtml.join('');
    };

    const frontSheets = await buildSheetsHtml('front');
    const hasBackContent = (template.showFields || []).some((f) => IdCardsService.BACK_ONLY_FIELDS.includes(f))
      || !!template.validityText || !!template.noteText || template.showSignatureLine;
    const backSheets = includeBack && hasBackContent ? await buildSheetsHtml('back') : '';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          @page { size: A4; margin: 0; }
          body { margin: 0; }
          .sheet { position: relative; width: 210mm; height: 297mm; page-break-after: always; }
          ${this.cardCss(template.layoutStyle, template.primaryColor, template.accentColor)}
        </style>
      </head>
      <body>
        ${frontSheets}
        ${backSheets}
      </body>
      </html>
    `;

    return this.pdfService.htmlToPdfWithOptions(html, {
      width: '210mm', height: '297mm', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
  }
}
