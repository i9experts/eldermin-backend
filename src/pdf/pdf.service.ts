import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as puppeteer from 'puppeteer';
import { IsString, IsOptional, IsMongoId } from 'class-validator';
import { PdfLog, PdfLogDocument } from './schemas/pdf-log.schema';

export class GenerateReportCardDto {
  @IsMongoId() studentId: string;
  @IsString() academicYear: string;
  @IsOptional() @IsString() term?: string;
}

export class GenerateInvoiceDto {
  @IsMongoId() invoiceId: string;
}

export class GenerateTarbiyahDto {
  @IsMongoId() studentId: string;
  @IsString() academicYear: string;
  @IsOptional() @IsString() term?: string;
}

export class BulkReportCardDto {
  @IsString() gradeId: string;
  @IsString() academicYear: string;
  @IsOptional() @IsString() term?: string;
}

const REPORT_CARD_TEMPLATE = (data: any) => `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #0D1F35; background: #fff; }
  .page { width: 210mm; min-height: 297mm; padding: 16mm; }
  .header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 14px; border-bottom: 3px solid #1B4F8A; margin-bottom: 18px; }
  .school-name { font-size: 22px; font-weight: 800; color: #1B4F8A; letter-spacing: -0.5px; }
  .school-sub { font-size: 12px; color: #3D5A7A; margin-top: 2px; }
  .doc-title { font-size: 14px; font-weight: 700; color: #F5A623; text-align: right; text-transform: uppercase; letter-spacing: 1px; }
  .doc-year { font-size: 12px; color: #3D5A7A; text-align: right; }
  .student-box { background: #F7FAFD; border: 1px solid #DDE8F4; border-radius: 10px; padding: 16px; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
  .info-label { font-size: 10px; font-weight: 700; color: #7A9AB8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px; }
  .info-value { font-size: 14px; font-weight: 600; color: #0D1F35; }
  .section-title { font-size: 13px; font-weight: 700; color: #1B4F8A; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 2px solid #EEF4FB; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
  th { background: #1B4F8A; color: #fff; padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
  th:last-child { text-align: center; }
  td { padding: 10px 12px; border-bottom: 1px solid #EEF4FB; }
  tr:nth-child(even) td { background: #F7FAFD; }
  td:last-child { text-align: center; }
  .grade-a { color: #16A34A; font-weight: 700; }
  .grade-b { color: #2563EB; font-weight: 700; }
  .grade-c { color: #D97706; font-weight: 700; }
  .grade-d { color: #DC2626; font-weight: 700; }
  .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
  .summary-card { background: #F7FAFD; border: 1px solid #DDE8F4; border-radius: 8px; padding: 12px; text-align: center; }
  .summary-num { font-size: 24px; font-weight: 800; color: #1B4F8A; }
  .summary-label { font-size: 10px; color: #7A9AB8; font-weight: 600; text-transform: uppercase; margin-top: 3px; }
  .tarb-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px; }
  .tarb-item { display: flex; align-items: center; gap: 8px; }
  .tarb-bar-wrap { flex: 1; background: #EEF4FB; border-radius: 4px; height: 6px; overflow: hidden; }
  .tarb-bar { height: 100%; border-radius: 4px; background: #1B4F8A; }
  .tarb-name { font-size: 11px; color: #3D5A7A; width: 80px; }
  .tarb-score { font-size: 11px; font-weight: 700; color: #1B4F8A; width: 28px; text-align: right; }
  .remarks-box { background: #FEF3DC; border: 1px solid #F5A623; border-radius: 8px; padding: 14px; margin-bottom: 20px; }
  .remarks-text { font-size: 13px; color: #0D1F35; line-height: 1.6; }
  .sig-row { display: flex; justify-content: space-between; margin-top: 32px; padding-top: 16px; border-top: 1px solid #DDE8F4; }
  .sig-item { text-align: center; }
  .sig-line { width: 140px; border-bottom: 1.5px solid #0D1F35; margin-bottom: 6px; height: 32px; }
  .sig-label { font-size: 11px; color: #3D5A7A; font-weight: 600; }
  .footer { text-align: center; margin-top: 20px; font-size: 10px; color: #7A9AB8; border-top: 1px solid #EEF4FB; padding-top: 10px; }
  .footer strong { color: #1B4F8A; }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="school-name">${data.schoolName}</div>
      <div class="school-sub">${data.schoolAddress || ''}</div>
    </div>
    <div>
      <div class="doc-title">Student Report Card</div>
      <div class="doc-year">${data.academicYear} ${data.term ? '· ' + data.term : ''}</div>
    </div>
  </div>
  <div class="student-box">
    <div><div class="info-label">Student Name</div><div class="info-value">${data.studentName}</div></div>
    <div><div class="info-label">Roll Number</div><div class="info-value">${data.rollNumber || 'N/A'}</div></div>
    <div><div class="info-label">Grade / Class</div><div class="info-value">${data.grade} ${data.section || ''}</div></div>
    <div><div class="info-label">Date of Birth</div><div class="info-value">${data.dob || 'N/A'}</div></div>
    <div><div class="info-label">Attendance</div><div class="info-value">${data.attendance || 'N/A'}</div></div>
    <div><div class="info-label">Report Date</div><div class="info-value">${new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</div></div>
  </div>
  <div class="section-title">Academic Performance</div>
  <table>
    <thead>
      <tr>
        <th style="width:35%">Subject</th>
        <th>Total Marks</th>
        <th>Obtained</th>
        <th>Percentage</th>
        <th>Grade</th>
        <th>Remarks</th>
      </tr>
    </thead>
    <tbody>
      ${(data.subjects || []).map((s: any) => {
        const pct = s.totalMarks ? Math.round((s.obtainedMarks / s.totalMarks) * 100) : 0;
        const grade = pct >= 80 ? 'A' : pct >= 65 ? 'B' : pct >= 50 ? 'C' : 'D';
        const cls = `grade-${grade.toLowerCase()}`;
        const remark = pct >= 80 ? 'Excellent' : pct >= 65 ? 'Good' : pct >= 50 ? 'Satisfactory' : 'Needs Improvement';
        return `<tr>
          <td><strong>${s.subjectName}</strong></td>
          <td>${s.totalMarks}</td>
          <td>${s.obtainedMarks}</td>
          <td>${pct}%</td>
          <td class="${cls}">${grade}</td>
          <td>${remark}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>
  <div class="summary-grid">
    <div class="summary-card"><div class="summary-num">${data.totalObtained || 0}</div><div class="summary-label">Total Obtained</div></div>
    <div class="summary-card"><div class="summary-num">${data.totalMarks || 0}</div><div class="summary-label">Total Marks</div></div>
    <div class="summary-card"><div class="summary-num" style="color:${data.overallPct >= 65 ? '#16A34A' : '#DC2626'}">${data.overallPct || 0}%</div><div class="summary-label">Overall %</div></div>
    <div class="summary-card"><div class="summary-num" style="color:#F5A623">${data.overallGrade || 'N/A'}</div><div class="summary-label">Final Grade</div></div>
  </div>
  ${data.tarbiyah && data.tarbiyah.length > 0 ? `
  <div class="section-title">Behaviour & Tarbiyah</div>
  <div class="tarb-grid">
    ${data.tarbiyah.map((t: any) => `
    <div class="tarb-item">
      <div class="tarb-name">${t.trait}</div>
      <div class="tarb-bar-wrap"><div class="tarb-bar" style="width:${t.score}%"></div></div>
      <div class="tarb-score">${t.score}</div>
    </div>`).join('')}
  </div>` : ''}
  ${data.remarks ? `
  <div class="section-title">Class Teacher Remarks</div>
  <div class="remarks-box"><div class="remarks-text">${data.remarks}</div></div>` : ''}
  <div class="sig-row">
    <div class="sig-item"><div class="sig-line"></div><div class="sig-label">Class Teacher</div></div>
    <div class="sig-item"><div class="sig-line"></div><div class="sig-label">Principal</div></div>
    <div class="sig-item"><div class="sig-line"></div><div class="sig-label">Parent / Guardian</div></div>
  </div>
  <div class="footer">Generated by <strong>Eldermin ERP</strong> · ${data.schoolName} · ${new Date().toLocaleDateString()}</div>
</div>
</body>
</html>
`;

const INVOICE_TEMPLATE = (data: any) => `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #0D1F35; background: #fff; }
  .page { width: 210mm; min-height: 297mm; padding: 16mm; }
  .header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 3px solid #1B4F8A; }
  .school-name { font-size: 22px; font-weight: 800; color: #1B4F8A; }
  .school-sub { font-size: 12px; color: #3D5A7A; margin-top: 4px; }
  .inv-meta { text-align: right; }
  .inv-title { font-size: 28px; font-weight: 900; color: #F5A623; letter-spacing: -1px; }
  .inv-num { font-size: 13px; color: #3D5A7A; margin-top: 4px; }
  .info-row { display: flex; justify-content: space-between; margin-bottom: 28px; }
  .info-label { font-size: 10px; font-weight: 700; color: #7A9AB8; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px; }
  .info-value { font-size: 14px; font-weight: 600; color: #0D1F35; }
  .info-sub { font-size: 12px; color: #3D5A7A; margin-top: 2px; }
  .status-badge { display: inline-block; padding: 4px 14px; border-radius: 100px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 6px; }
  .status-paid { background: #DCFCE7; color: #16A34A; }
  .status-pending { background: #FEF3DC; color: #C8811A; }
  .status-overdue { background: #FEE2E2; color: #DC2626; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  thead th { background: #1B4F8A; color: #fff; padding: 12px 14px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
  thead th:last-child { text-align: right; }
  tbody td { padding: 12px 14px; border-bottom: 1px solid #EEF4FB; font-size: 13px; }
  tbody tr:nth-child(even) td { background: #F7FAFD; }
  tbody td:last-child { text-align: right; font-weight: 600; }
  .totals { margin-left: auto; width: 280px; }
  .total-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 13px; border-bottom: 1px solid #EEF4FB; }
  .total-row.grand { font-size: 16px; font-weight: 800; color: #1B4F8A; border-bottom: none; padding-top: 12px; margin-top: 4px; border-top: 2px solid #1B4F8A; }
  .total-label { color: #3D5A7A; }
  .total-value { font-weight: 600; }
  .payment-box { background: #F7FAFD; border: 1px solid #DDE8F4; border-radius: 10px; padding: 16px; margin-top: 24px; }
  .payment-title { font-size: 11px; font-weight: 700; color: #7A9AB8; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 10px; }
  .payment-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .payment-item-label { font-size: 10px; color: #7A9AB8; margin-bottom: 3px; }
  .payment-item-value { font-size: 13px; font-weight: 600; }
  .footer { text-align: center; margin-top: 32px; font-size: 10px; color: #7A9AB8; border-top: 1px solid #EEF4FB; padding-top: 12px; }
  .footer strong { color: #1B4F8A; }
  .watermark-paid { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%) rotate(-35deg); font-size: 80px; font-weight: 900; color: rgba(22,163,74,0.08); letter-spacing: 4px; pointer-events: none; }
</style>
</head>
<body>
<div class="page" style="position:relative;">
  ${data.status === 'paid' ? '<div class="watermark-paid">PAID</div>' : ''}
  <div class="header">
    <div>
      <div class="school-name">${data.schoolName}</div>
      <div class="school-sub">${data.schoolAddress || ''}</div>
      ${data.schoolPhone ? `<div class="school-sub">📞 ${data.schoolPhone}</div>` : ''}
    </div>
    <div class="inv-meta">
      <div class="inv-title">INVOICE</div>
      <div class="inv-num"># ${data.invoiceNumber}</div>
      <div class="status-badge status-${data.status || 'pending'}">${data.status || 'Pending'}</div>
    </div>
  </div>
  <div class="info-row">
    <div class="info-block">
      <div class="info-label">Billed To</div>
      <div class="info-value">${data.studentName}</div>
      <div class="info-sub">Grade ${data.grade} ${data.section || ''}</div>
      ${data.parentName ? `<div class="info-sub">Parent: ${data.parentName}</div>` : ''}
      ${data.parentPhone ? `<div class="info-sub">📞 ${data.parentPhone}</div>` : ''}
    </div>
    <div class="info-block" style="text-align:right;">
      <div class="info-label">Invoice Details</div>
      <div class="info-value">${data.invoiceNumber}</div>
      <div class="info-sub">Issue Date: ${data.issueDate || new Date().toLocaleDateString('en-GB')}</div>
      <div class="info-sub">Due Date: <strong>${data.dueDate || 'N/A'}</strong></div>
      <div class="info-sub">Period: ${data.period || data.academicYear || ''}</div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:50%">Fee Description</th>
        <th>Fee Type</th>
        <th>Due Date</th>
        <th>Amount (${data.currency || 'PKR'})</th>
      </tr>
    </thead>
    <tbody>
      ${(data.feeItems || []).map((item: any) => `
      <tr>
        <td>${item.description}</td>
        <td>${item.type || 'Tuition'}</td>
        <td>${item.dueDate || data.dueDate || 'N/A'}</td>
        <td>${Number(item.amount).toLocaleString()}</td>
      </tr>`).join('')}
    </tbody>
  </table>
  <div class="totals">
    <div class="total-row"><span class="total-label">Subtotal</span><span class="total-value">${data.currency || 'PKR'} ${Number(data.subtotal || 0).toLocaleString()}</span></div>
    ${data.discount ? `<div class="total-row"><span class="total-label">Discount</span><span class="total-value" style="color:#16A34A">- ${data.currency || 'PKR'} ${Number(data.discount).toLocaleString()}</span></div>` : ''}
    ${data.lateFee ? `<div class="total-row"><span class="total-label">Late Fee</span><span class="total-value" style="color:#DC2626">+ ${data.currency || 'PKR'} ${Number(data.lateFee).toLocaleString()}</span></div>` : ''}
    <div class="total-row grand"><span>Total Due</span><span>${data.currency || 'PKR'} ${Number(data.totalAmount || 0).toLocaleString()}</span></div>
  </div>
  <div class="payment-box">
    <div class="payment-title">Payment Instructions</div>
    <div class="payment-grid">
      <div class="payment-item"><div class="payment-item-label">Bank Name</div><div class="payment-item-value">${data.bankName || 'HBL'}</div></div>
      <div class="payment-item"><div class="payment-item-label">Account Title</div><div class="payment-item-value">${data.accountTitle || data.schoolName}</div></div>
      <div class="payment-item"><div class="payment-item-label">Account Number</div><div class="payment-item-value">${data.accountNumber || 'N/A'}</div></div>
      <div class="payment-item"><div class="payment-item-label">IBAN</div><div class="payment-item-value">${data.iban || 'N/A'}</div></div>
    </div>
  </div>
  <div class="footer">Generated by <strong>Eldermin ERP</strong> · ${data.schoolName} · ${new Date().toLocaleDateString()} · This is a computer-generated invoice.</div>
</div>
</body>
</html>
`;

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  constructor(
    @InjectModel(PdfLog.name) private pdfLogModel: Model<PdfLogDocument>,
    @InjectModel('Student') private studentModel: Model<any>,
    @InjectModel('Invoice') private invoiceModel: Model<any>,
    @InjectModel('School') private schoolModel: Model<any>,
    @InjectModel('Assessment') private assessmentModel: Model<any>,
    @InjectModel('Behaviour') private behaviourModel: Model<any>,
  ) {}

  private async htmlToPdf(html: string): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      });
      return pdfBuffer as Buffer;
    } finally {
      await browser.close();
    }
  }

  private async getSchool(schoolSlug: string) {
    const school = await this.schoolModel.findOne({ slug: schoolSlug }).lean();
    if (!school) throw new NotFoundException(`School not found: ${schoolSlug}`);
    return school;
  }

  private async logPdf(data: Partial<PdfLog>) {
    await this.pdfLogModel.create(data);
  }

  async generateReportCard(
    schoolSlug: string,
    dto: GenerateReportCardDto,
    userId: string,
  ): Promise<Buffer> {
    const school = await this.getSchool(schoolSlug);

    const student = await this.studentModel
      .findOne({ _id: dto.studentId, schoolSlug })
      .lean();
    if (!student) throw new NotFoundException('Student not found');

    const assessments = await this.assessmentModel
      .find({
        schoolSlug,
        studentId: dto.studentId,
        academicYear: dto.academicYear,
        ...(dto.term ? { term: dto.term } : {}),
      })
      .lean();

    const behaviour = await this.behaviourModel
      .findOne({
        schoolSlug,
        studentId: dto.studentId,
        academicYear: dto.academicYear,
      })
      .lean();

    const subjects = assessments.map((a: any) => ({
      subjectName: a.subjectName || a.subject,
      totalMarks: a.totalMarks || 100,
      obtainedMarks: a.obtainedMarks || a.marksObtained || 0,
    }));

    const totalMarks = subjects.reduce((s: number, x: any) => s + x.totalMarks, 0);
    const totalObtained = subjects.reduce((s: number, x: any) => s + x.obtainedMarks, 0);
    const overallPct = totalMarks > 0 ? Math.round((totalObtained / totalMarks) * 100) : 0;
    const overallGrade = overallPct >= 80 ? 'A' : overallPct >= 65 ? 'B' : overallPct >= 50 ? 'C' : 'D';

    const tarbiyah = (behaviour as any)?.traits
      ? Object.entries((behaviour as any).traits).map(([trait, score]) => ({
          trait: trait.charAt(0).toUpperCase() + trait.slice(1),
          score: Number(score),
        }))
      : [];

    const data = {
      schoolName: (school as any).name,
      schoolAddress: (school as any).address || '',
      academicYear: dto.academicYear,
      term: dto.term || '',
      studentName: `${(student as any).firstName} ${(student as any).lastName}`,
      rollNumber: (student as any).rollNumber || (student as any).admissionNumber || 'N/A',
      grade: (student as any).grade || (student as any).gradeLevel || '',
      section: (student as any).section || '',
      dob: (student as any).dateOfBirth
        ? new Date((student as any).dateOfBirth).toLocaleDateString('en-GB')
        : 'N/A',
      attendance: (student as any).attendancePct ? `${(student as any).attendancePct}%` : 'N/A',
      subjects,
      totalMarks,
      totalObtained,
      overallPct,
      overallGrade,
      tarbiyah,
      remarks: (behaviour as any)?.teacherRemarks || '',
    };

    const html = REPORT_CARD_TEMPLATE(data);
    const pdf = await this.htmlToPdf(html);

    await this.logPdf({
      schoolSlug,
      type: 'report-card',
      referenceId: dto.studentId,
      referenceName: data.studentName,
      generatedBy: userId,
      status: 'success',
      fileSizeKb: Math.round(pdf.length / 1024),
    });

    return pdf;
  }

  async generateInvoice(
    schoolSlug: string,
    dto: GenerateInvoiceDto,
    userId: string,
  ): Promise<Buffer> {
    const school = await this.getSchool(schoolSlug);

    const invoice = await this.invoiceModel
      .findOne({ _id: dto.invoiceId, schoolSlug })
      .populate('studentId')
      .lean();

    if (!invoice) throw new NotFoundException('Invoice not found');

    const student: any = (invoice as any).studentId;

    const data = {
      schoolName: (school as any).name,
      schoolAddress: (school as any).address || '',
      schoolPhone: (school as any).phone || '',
      bankName: (school as any).bankName || 'HBL',
      accountTitle: (school as any).accountTitle || (school as any).name,
      accountNumber: (school as any).accountNumber || '',
      iban: (school as any).iban || '',
      currency: (school as any).currency || 'PKR',
      invoiceNumber: (invoice as any).invoiceNumber || `INV-${dto.invoiceId.slice(-6).toUpperCase()}`,
      status: (invoice as any).status || 'pending',
      issueDate: (invoice as any).issueDate
        ? new Date((invoice as any).issueDate).toLocaleDateString('en-GB')
        : new Date().toLocaleDateString('en-GB'),
      dueDate: (invoice as any).dueDate
        ? new Date((invoice as any).dueDate).toLocaleDateString('en-GB')
        : 'N/A',
      period: (invoice as any).period || (invoice as any).academicYear || '',
      studentName: student ? `${student.firstName} ${student.lastName}` : 'N/A',
      grade: student?.grade || '',
      section: student?.section || '',
      parentName: student?.parentName || '',
      parentPhone: student?.parentPhone || '',
      feeItems: (invoice as any).feeItems || [],
      subtotal: (invoice as any).subtotal || (invoice as any).amount || 0,
      discount: (invoice as any).discount || 0,
      lateFee: (invoice as any).lateFee || 0,
      totalAmount: (invoice as any).totalAmount || (invoice as any).amount || 0,
    };

    const html = INVOICE_TEMPLATE(data);
    const pdf = await this.htmlToPdf(html);

    await this.logPdf({
      schoolSlug,
      type: 'invoice',
      referenceId: dto.invoiceId,
      referenceName: `${data.invoiceNumber} - ${data.studentName}`,
      generatedBy: userId,
      status: 'success',
      fileSizeKb: Math.round(pdf.length / 1024),
    });

    return pdf;
  }

  async generateBulkReportCards(
    schoolSlug: string,
    dto: BulkReportCardDto,
    userId: string,
  ): Promise<{ count: number; message: string }> {
    const students = await this.studentModel
      .find({ schoolSlug, grade: dto.gradeId, isActive: true })
      .lean();

    let successCount = 0;
    for (const student of students) {
      try {
        await this.generateReportCard(
          schoolSlug,
          { studentId: (student as any)._id.toString(), academicYear: dto.academicYear, term: dto.term },
          userId,
        );
        successCount++;
      } catch (err) {
        this.logger.error(`Failed for student ${(student as any)._id}: ${err.message}`);
        await this.logPdf({
          schoolSlug,
          type: 'report-card',
          referenceId: (student as any)._id.toString(),
          referenceName: `${(student as any).firstName} ${(student as any).lastName}`,
          generatedBy: userId,
          status: 'failed',
          errorMessage: err.message,
        });
      }
    }
    return { count: successCount, message: `Generated ${successCount}/${students.length} report cards` };
  }

  async getPdfLogs(schoolSlug: string, type?: string) {
    const filter: any = { schoolSlug };
    if (type) filter.type = type;
    return this.pdfLogModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
  }
}
