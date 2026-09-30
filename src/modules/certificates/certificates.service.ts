// ============================================================
// CERTIFICATES SERVICE — Eldermin ERP | NestJS
// Purpose-built printable certificate designer + generator for students,
// following the exact structure of IdCardsService (template CRUD, a
// school-branding resolver, a Puppeteer HTML->PDF render path) adapted
// for a full-page prose/structured document instead of a small CR80 card.
// ============================================================

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as QRCode from 'qrcode';
import { randomBytes } from 'crypto';
import { PdfService } from '../../pdf/pdf.service';
import {
  CertificateTemplate, CertificateTemplateDocument, CERTIFICATE_TYPES,
} from './schemas/certificate-template.schema';
import { IssuedCertificate, IssuedCertificateDocument } from './schemas/issued-certificate.schema';
import { CreateCertificateTemplateDto, UpdateCertificateTemplateDto } from './dto/certificate.dto';
import { Campus } from '../../organization/schemas/organization.schema';
import { GroupInstitution } from '../../organization/schemas/group-institution.schema';

@Injectable()
export class CertificatesService {
  constructor(
    @InjectModel(CertificateTemplate.name) private templateModel: Model<CertificateTemplateDocument>,
    @InjectModel(IssuedCertificate.name) private issuedModel: Model<IssuedCertificateDocument>,
    @InjectModel('Student') private studentModel: Model<any>,
    @InjectModel('School') private schoolModel: Model<any>,
    @InjectModel(Campus.name) private campusModel: Model<any>,
    @InjectModel(GroupInstitution.name) private institutionModel: Model<any>,
    private readonly pdfService: PdfService,
  ) {}

  // ── Templates CRUD ──────────────────────────────────────────
  async listTemplates(schoolSlug: string, certificateType?: string) {
    const filter: any = { schoolSlug };
    if (certificateType) filter.certificateType = certificateType;
    return this.templateModel.find(filter).sort({ isDefault: -1, createdAt: -1 }).lean();
  }

  async createTemplate(schoolSlug: string, createdBy: string, dto: CreateCertificateTemplateDto) {
    const isFirst = (await this.templateModel.countDocuments({ schoolSlug, certificateType: dto.certificateType })) === 0;
    const template = new this.templateModel({ ...dto, schoolSlug, createdBy, isDefault: isFirst });
    return template.save();
  }

  async updateTemplate(id: string, schoolSlug: string, dto: UpdateCertificateTemplateDto) {
    const existing = await this.templateModel.findOne({ _id: id, schoolSlug });
    if (!existing) throw new NotFoundException('Certificate template not found.');
    Object.assign(existing, dto);
    return existing.save();
  }

  async deleteTemplate(id: string, schoolSlug: string) {
    const template = await this.templateModel.findOne({ _id: id, schoolSlug });
    if (!template) throw new NotFoundException('Certificate template not found.');
    if (template.isDefault) {
      throw new BadRequestException('Cannot delete the default template for this certificate type - set another template as default first.');
    }
    await template.deleteOne();
    return { message: 'Template deleted.' };
  }

  async setDefaultTemplate(id: string, schoolSlug: string) {
    const template = await this.templateModel.findOne({ _id: id, schoolSlug });
    if (!template) throw new NotFoundException('Certificate template not found.');
    await this.templateModel.updateMany(
      { schoolSlug, certificateType: template.certificateType, _id: { $ne: id } },
      { $set: { isDefault: false } },
    );
    template.isDefault = true;
    await template.save();
    return template;
  }

  // ── Recently issued (audit / reprint) ───────────────────────
  async getIssuedForStudent(schoolSlug: string, studentId: string) {
    return this.issuedModel.find({ schoolSlug, studentId }).sort({ issuedAt: -1 }).limit(50).lean();
  }

  // ── School branding (same institution/campus resolution as
  // IdCardsService.resolveBranding) ───────────────────────────
  private async resolveBranding(schoolSlug: string, campusId?: any): Promise<{ name: string; logo: string; campusName: string }> {
    const school: any = await this.schoolModel.findOne({ slug: schoolSlug }).lean();
    let institutionName: string | undefined, institutionLogo: string | undefined;
    let campusName = '';
    if (campusId) {
      const campus: any = await this.campusModel.findOne({ _id: campusId, schoolSlug }).lean();
      campusName = campus?.name || '';
      if (campus?.institutionId) {
        const inst: any = await this.institutionModel.findOne({ _id: campus.institutionId, schoolSlug }).lean();
        institutionName = inst?.name; institutionLogo = inst?.logoUrl;
      }
    }
    return {
      name: institutionName || school?.name || 'School',
      logo: institutionLogo || school?.logo || '',
      campusName,
    };
  }

  private escapeHtml(text: any): string {
    if (text === undefined || text === null) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private fmtDate(d: any) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  private generateCertificateNumber(schoolSlug: string, certificateType: string): string {
    const prefix = schoolSlug.slice(0, 4).toUpperCase();
    const typeCode = certificateType.slice(0, 3).toUpperCase();
    const stamp = Date.now().toString(36).toUpperCase();
    const rand = randomBytes(2).toString('hex').toUpperCase();
    return `${prefix}-${typeCode}-${stamp}-${rand}`;
  }

  // Flattens a Student document into the {{mergeField}} data a template
  // body can reference - see STUDENT_MERGE_FIELDS. Deliberately never
  // fabricates a value for a field the schema doesn't have (e.g. no fake
  // "division" or "conduct" here) - those are always per-generation
  // extraFields the school actually types in, not guessed.
  private mapStudentMergeFields(doc: any, branding: { name: string; campusName: string }, issueDate: string, certificateNumber: string): Record<string, string> {
    const father = (doc.guardians || []).find((g: any) => g.relation === 'father');
    const mother = (doc.guardians || []).find((g: any) => g.relation === 'mother');
    const primaryGuardian = (doc.guardians || []).find((g: any) => g.isPrimary) || father || (doc.guardians || [])[0];
    return {
      studentName: `${doc.firstName || ''} ${doc.lastName || ''}`.trim(),
      fatherName: father?.name || '',
      motherName: mother?.name || '',
      guardianName: primaryGuardian?.name || '',
      guardianContact: primaryGuardian?.phone || '',
      admissionNo: doc.admissionNumber || '',
      grNo: doc.grNo || '',
      grade: doc.currentGrade || '',
      section: doc.currentSection || '',
      academicYear: doc.currentAcademicYear || '',
      dob: this.fmtDate(doc.dateOfBirth),
      gender: doc.gender || '',
      nationality: doc.nationality || '',
      religion: doc.religion || '',
      admissionDate: this.fmtDate(doc.admissionDate),
      campusName: branding.campusName || '',
      schoolName: branding.name || '',
      issueDate,
      certificateNumber,
    };
  }

  // Simple, dependency-free {{token}} substitution - matches the same
  // "no framework, just what's needed" choice already made for
  // payslip-number-to-words.util.ts elsewhere in this codebase. Any
  // token not present in data is left blank rather than printing a
  // literal "{{undefinedField}}" on an official document.
  private renderMergeFields(template: string, data: Record<string, string>): string {
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key) => this.escapeHtml(data[key] ?? ''));
  }

  private certificateCss(layoutStyle: string, primary: string, accent: string, orientation: string): string {
    const pageSize = orientation === 'landscape' ? '297mm 210mm' : '210mm 297mm';
    const base = `
      @page { size: ${pageSize}; margin: 0; }
      body { margin: 0; font-family: 'Georgia', 'Times New Roman', serif; }
      /* z-index: 0 (not just position: relative) so this establishes its
         own stacking context - otherwise the watermark's negative
         z-index escapes it and sinks below the whole page, the same
         gotcha fixed in id-cards.service.ts's cardCss(). */
      .sheet { position: relative; z-index: 0; width: ${orientation === 'landscape' ? '297mm' : '210mm'};
        height: ${orientation === 'landscape' ? '210mm' : '297mm'}; box-sizing: border-box; background: #fff;
        overflow: hidden; padding: 14mm 16mm; display: flex; flex-direction: column; }
      .watermark { position: absolute; inset: 0; width: 100%; height: 100%;
        object-fit: cover; z-index: -1; }
      .cert-header { text-align: center; margin-bottom: 6mm; }
      .cert-header img.logo { height: 22mm; width: auto; max-width: 40mm; object-fit: contain; margin-bottom: 3mm; }
      .cert-header .school-name { font-size: 20pt; font-weight: bold; color: ${primary}; letter-spacing: 0.3pt; }
      .cert-header .campus-name { font-size: 11pt; color: #555; margin-top: 1mm; }
      .cert-header .contact-line { font-size: 8pt; color: #888; margin-top: 1mm; }
      .cert-divider { border: none; border-top: 0.6mm solid ${accent}; width: 40mm; margin: 4mm auto; }
      .cert-title { text-align: center; font-size: 16pt; font-weight: bold; letter-spacing: 1pt;
        text-transform: uppercase; color: ${primary}; margin: 4mm 0 8mm; }
      .cert-number { position: absolute; top: 8mm; right: 10mm; font-size: 7pt; color: #999; }
      .cert-date { position: absolute; top: 8mm; left: 10mm; font-size: 7pt; color: #999; }
      .cert-body { font-size: 12pt; line-height: 1.9; color: #222; text-align: justify; }
      .cert-body p { margin: 0 0 4mm; }
      .cert-body table { width: 100%; border-collapse: collapse; margin: 3mm 0; font-size: 10.5pt; }
      .cert-body table td, .cert-body table th { border: 0.3mm solid #ccc; padding: 2mm 3mm; text-align: left; }
      .cert-footer-note { font-size: 8pt; color: #888; text-align: center; margin-top: 6mm; font-style: italic; }
      .signature-row { display: flex; justify-content: space-around; margin-top: auto; padding-top: 16mm; }
      .signature-block { text-align: center; width: 45mm; }
      .signature-line { border-top: 0.3mm solid #444; margin-bottom: 2mm; }
      .signature-label { font-size: 9pt; color: #444; font-weight: 600; }
      .seal { position: absolute; bottom: 20mm; right: 20mm; width: 26mm; height: 26mm; object-fit: contain; opacity: 0.9; }
      .qr-block { position: absolute; bottom: 10mm; left: 10mm; text-align: center; }
      .qr-block img { width: 18mm; height: 18mm; }
      .qr-block .qr-label { font-size: 6pt; color: #999; margin-top: 1mm; }
    `;
    if (layoutStyle === 'formal') {
      return base + `
        .sheet { border: 2.5mm double ${accent}; }
        .sheet::before { content: ''; position: absolute; inset: 6mm; border: 0.4mm solid ${primary}; pointer-events: none; }
        .cert-title { font-size: 22pt; }
        .cert-body { font-size: 12.5pt; text-align: center; }
      `;
    }
    if (layoutStyle === 'minimal') {
      return base + `
        .cert-header .school-name { font-size: 15pt; }
        .cert-title { font-size: 13pt; }
        .cert-body { text-align: left; }
      `;
    }
    if (layoutStyle === 'modern') {
      return base + `
        .sheet { border-top: 4mm solid ${primary}; }
        .cert-title { color: ${accent}; }
      `;
    }
    // classic
    return base + `
      .sheet { border: 1mm solid ${primary}; }
    `;
  }

  private async buildCertificateHtml(
    template: CertificateTemplateDocument, mergeData: Record<string, string>,
    branding: { name: string; logo: string; campusName: string },
  ): Promise<string> {
    const logoHtml = branding.logo ? `<img class="logo" src="${this.escapeHtml(branding.logo)}" />` : '';
    const watermarkHtml = template.backgroundImageUrl
      ? `<img class="watermark" src="${this.escapeHtml(template.backgroundImageUrl)}" style="opacity:${template.backgroundImageOpacity ?? 0.06};" />`
      : '';

    let qrHtml = '';
    if (template.showQrCode) {
      const qrDataUrl = await QRCode.toDataURL(`CERT:${mergeData.certificateNumber}`, { width: 120, margin: 0 });
      qrHtml = `<div class="qr-block"><img src="${qrDataUrl}" /><div class="qr-label">${this.escapeHtml(mergeData.certificateNumber)}</div></div>`;
    }
    const sealHtml = template.showSeal && template.sealImageUrl
      ? `<img class="seal" src="${this.escapeHtml(template.sealImageUrl)}" />` : '';

    const bodyHtml = this.renderRichBody(template.bodyTemplate, mergeData);
    const signatureRow = (template.signatories || []).length
      ? `<div class="signature-row">${(template.signatories || []).map((s) => `
          <div class="signature-block">
            <div class="signature-line"></div>
            <div class="signature-label">${this.escapeHtml(s.label)}</div>
          </div>`).join('')}</div>`
      : '';

    const titleMap: Record<string, string> = {
      transfer: 'School Leaving / Transfer Certificate', character: 'Character Certificate',
      bonafide: 'Bonafide Certificate', provisional: 'Provisional Certificate',
      migration: 'Migration Certificate', merit: 'Certificate of Merit',
      participation: 'Certificate of Participation', attendance: 'Certificate of Attendance',
      graduation: 'Certificate of Graduation', custom: template.name,
    };

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8" />
        <style>${this.certificateCss(template.layoutStyle, template.primaryColor, template.accentColor, template.orientation)}</style>
      </head>
      <body>
        <div class="sheet">
          ${watermarkHtml}
          <div class="cert-date">Date: ${this.escapeHtml(mergeData.issueDate)}</div>
          <div class="cert-number">No: ${this.escapeHtml(mergeData.certificateNumber)}</div>
          <div class="cert-header">
            ${logoHtml}
            <div class="school-name">${this.escapeHtml(branding.name)}</div>
            ${branding.campusName ? `<div class="campus-name">${this.escapeHtml(branding.campusName)}</div>` : ''}
          </div>
          <hr class="cert-divider" />
          <div class="cert-title">${this.escapeHtml(titleMap[template.certificateType] || template.name)}</div>
          <div class="cert-body">${bodyHtml}</div>
          ${template.footerNote ? `<div class="cert-footer-note">${this.escapeHtml(template.footerNote)}</div>` : ''}
          ${signatureRow}
          ${qrHtml}${sealHtml}
        </div>
      </body>
      </html>
    `;
  }

  // bodyTemplate is trusted, admin-authored HTML (same trust level as the
  // rest of this school's own content - report templates already allow
  // arbitrary body HTML) - merge-field values within it are still
  // escaped by renderMergeFields, only the admin's own markup passes
  // through unescaped.
  private renderRichBody(bodyTemplate: string, data: Record<string, string>): string {
    return this.renderMergeFields(bodyTemplate, data);
  }

  // ── Batch generation ─────────────────────────────────────────
  async generateCertificatesPdf(
    schoolSlug: string,
    templateId: string,
    studentIds: string[],
    extraFields: Record<string, string> | undefined,
    issueDateInput: string | undefined,
    issuedBy: string,
  ): Promise<Buffer> {
    const template = await this.templateModel.findOne({ _id: templateId, schoolSlug });
    if (!template) throw new NotFoundException('Certificate template not found.');
    if (!template.isActive) throw new BadRequestException('This certificate template is inactive.');

    const students = await this.studentModel.find({ schoolSlug, _id: { $in: studentIds } }).lean();
    if (students.length === 0) throw new BadRequestException('None of the selected students were found.');

    const issueDate = issueDateInput ? this.fmtDate(issueDateInput) : this.fmtDate(new Date());

    const brandingCache = new Map<string, { name: string; logo: string; campusName: string }>();
    const brandingFor = async (campusId: any) => {
      const key = campusId ? String(campusId) : '';
      if (!brandingCache.has(key)) brandingCache.set(key, await this.resolveBranding(schoolSlug, campusId));
      return brandingCache.get(key)!;
    };

    const pagesHtml: string[] = [];
    const issuedRecords: any[] = [];
    for (const doc of students) {
      const branding = await brandingFor((doc as any).campusId);
      const certificateNumber = this.generateCertificateNumber(schoolSlug, template.certificateType);
      const mergeData = {
        ...this.mapStudentMergeFields(doc, branding, issueDate, certificateNumber),
        ...(extraFields || {}),
      };
      const html = await this.buildCertificateHtml(template, mergeData, branding);
      pagesHtml.push(html);
      issuedRecords.push({
        schoolSlug, certificateNumber, templateId: template._id, certificateType: template.certificateType,
        studentId: (doc as any)._id, studentName: mergeData.studentName, dataSnapshot: mergeData, issuedBy,
      });
    }

    // Each student is its own full HTML document (own <style>/<html>) -
    // rendered to its own PDF and merged, rather than concatenating
    // <body> fragments into one page, since @page sizing/orientation is
    // per-document in this render path (matches how the ID card and
    // report-template renderers already isolate whole-document styling).
    // preferCSSPageSize is required - without it Puppeteer ignores the
    // @page { size } rule in certificateCss() entirely and silently
    // defaults to US Letter portrait, which would both crop an A4-sized
    // layout and ignore the landscape orientation option completely.
    const pdfBuffers = await Promise.all(pagesHtml.map((html) => this.pdfService.htmlToPdfWithOptions(html, { printBackground: true, preferCSSPageSize: true })));
    const merged = await this.mergePdfBuffers(pdfBuffers);

    await this.issuedModel.insertMany(issuedRecords);
    return merged;
  }

  private async mergePdfBuffers(buffers: Buffer[]): Promise<Buffer> {
    if (buffers.length === 1) return buffers[0];
    const { PDFDocument } = await import('pdf-lib');
    const merged = await PDFDocument.create();
    for (const buf of buffers) {
      const src = await PDFDocument.load(buf);
      const pages = await merged.copyPages(src, src.getPageIndices());
      pages.forEach((p) => merged.addPage(p));
    }
    return Buffer.from(await merged.save());
  }
}
