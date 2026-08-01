import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as puppeteer from 'puppeteer';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { IsString, IsOptional, IsMongoId } from 'class-validator';
import { PdfLog, PdfLogDocument } from './schemas/pdf-log.schema';

// ── Report Templates: sample data for preview / ad-hoc generation ──────────
export function sampleDataForType(type: string): Record<string, any> {
  const common = {
    documentNumber: 'SAMPLE-0001',
    date: new Date().toLocaleDateString('en-GB'),
    academicYear: '2025-26',
  };

  switch (type) {
    case 'fee_receipt':
      return {
        ...common,
        receiptNumber: 'RCPT-2026-0001',
        studentName: 'Ayesha Khan',
        grade: 'Grade 5',
        section: 'A',
        rollNumber: '23',
        fatherName: 'Muhammad Khan',
        admissionNo: 'ADM-2023-0456',
        items: [
          { description: 'Tuition Fee - July 2026', amount: 8000 },
          { description: 'Transport Fee', amount: 2000 },
          { description: 'Exam Fee', amount: 500 },
        ],
        totalAmount: 10500,
        amountInWords: 'Ten Thousand Five Hundred Only',
        paymentMethod: 'Cash',
        transactionRef: 'N/A',
        paymentDate: new Date().toLocaleDateString('en-GB'),
      };
    case 'payment_voucher':
      return {
        ...common,
        voucherNumber: 'PV-2026-0001',
        department: 'Administration',
        debitAccount: 'Office Supplies Expense',
        creditAccount: 'Cash in Hand',
        amount: 15000,
        narration: 'Purchase of stationery and office supplies for July 2026',
        preparedBy: 'Accounts Clerk',
        approvedBy: 'Finance Manager',
        rows: [
          { account: 'Office Supplies Expense', debit: 15000, credit: 0 },
          { account: 'Cash in Hand', debit: 0, credit: 15000 },
        ],
      };
    case 'journal_voucher':
      return {
        ...common,
        voucherNumber: 'JV-2026-0001',
        narration: 'Adjustment entry for depreciation - July 2026',
        rows: [
          { account: 'Depreciation Expense', debit: 5000, credit: 0 },
          { account: 'Accumulated Depreciation', debit: 0, credit: 5000 },
        ],
        preparedBy: 'Accountant',
        approvedBy: 'Finance Manager',
      };
    case 'expense_voucher':
      return {
        ...common,
        voucherNumber: 'EV-2026-0001',
        category: 'Maintenance',
        paidTo: 'ABC Hardware Store',
        amount: 4200,
        narration: 'Plumbing repair works in main building',
        preparedBy: 'Admin Officer',
        approvedBy: 'Principal',
      };
    case 'payslip':
      return {
        ...common,
        employeeName: 'Fatima Sheikh',
        designation: 'Senior Teacher',
        department: 'Academics',
        month: 'July 2026',
        basicSalary: 60000,
        allowances: 8000,
        deductions: 3000,
        netSalary: 65000,
        items: [
          { description: 'Basic Salary', amount: 60000 },
          { description: 'House Rent Allowance', amount: 5000 },
          { description: 'Medical Allowance', amount: 3000 },
          { description: 'Tax Deduction', amount: -2000 },
          { description: 'Provident Fund', amount: -1000 },
        ],
      };
    case 'result_card':
      return {
        ...common,
        studentName: 'Hassan Raza',
        grade: 'Grade 8',
        section: 'B',
        rollNumber: '11',
        subjects: [
          { subjectName: 'Mathematics', totalMarks: 100, obtainedMarks: 88 },
          { subjectName: 'Science', totalMarks: 100, obtainedMarks: 76 },
          { subjectName: 'English', totalMarks: 100, obtainedMarks: 82 },
        ],
      };
    case 'attendance_sheet':
      return {
        ...common,
        grade: 'Grade 6',
        section: 'C',
        month: 'July 2026',
        items: [
          { description: 'Total Working Days', amount: 22 },
          { description: 'Present', amount: 20 },
          { description: 'Absent', amount: 2 },
        ],
      };
    case 'admission_letter':
      return {
        ...common,
        studentName: 'Zainab Ahmed',
        grade: 'Grade 1',
        admissionNo: 'ADM-2026-0099',
        guardianName: 'Ahmed Raza',
      };
    default:
      return {
        ...common,
        title: 'Sample Document',
        items: [
          { description: 'Sample Line Item', amount: 1000 },
        ],
      };
  }
}

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
    <div><div class="info-label">GR No</div><div class="info-value">${data.rollNumber || 'N/A'}</div></div>
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
    @InjectModel('ReportTemplate') private reportTemplateModel: Model<any>,
    @InjectModel('Payment') private paymentModel: Model<any>,
    @InjectModel('Expense') private expenseModel: Model<any>,
    @InjectModel('BankAccount') private bankAccountModel: Model<any>,
    @InjectModel('Campus') private campusModel: Model<any>,
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

  /**
   * Variant of htmlToPdf that accepts explicit puppeteer PDF options —
   * used by template-driven rendering so page size/orientation/margins
   * configured on a ReportTemplate are respected.
   */
  private async htmlToPdfWithOptions(
    html: string,
    options: puppeteer.PDFOptions,
  ): Promise<Buffer> {
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
        printBackground: true,
        ...options,
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

  /**
   * Generates a fee challan as a real PDF using pdf-lib (not Puppeteer/HTML —
   * Railway has no Chrome binary). Matches the school's real-world reference
   * format: landscape page, 3 side-by-side copies (Bank/School/Parent's),
   * separated by dashed cut lines, each with Issue/Due/Validity dates,
   * Challan No/GRN, Payable-by and After-due-date amounts.
   */
  async generateInvoice(
    schoolSlug: string,
    dto: GenerateInvoiceDto,
    userId: string,
  ): Promise<Buffer> {
    const school: any = await this.getSchool(schoolSlug);
    const invoice: any = await this.invoiceModel
      .findOne({ _id: dto.invoiceId, schoolSlug })
      .populate('studentId')
      .lean();
    if (!invoice) throw new NotFoundException('Invoice not found');

    const bankAccount: any = await this.bankAccountModel
      .findOne({ schoolSlug, isActive: true })
      .sort({ isPrimary: -1 })
      .lean();

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const logoImg = await this.embedSchoolLogo(pdfDoc, school);

    const data = this.buildChallanData(school, bankAccount, invoice);
    this.drawChallanPage(pdfDoc, data, logoImg, font, bold);

    const bytes = await pdfDoc.save();
    const pdf = Buffer.from(bytes);

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

  /**
   * Bulk challan printing - class-wise, section-wise, campus-wise, or every
   * billed student for a month - one landscape page (3 copies) per student
   * in a single combined PDF, so a school can print a whole class's
   * vouchers in one go instead of downloading them one at a time.
   */
  async generateBulkChallans(
    schoolSlug: string,
    params: {
      month: string;
      academicYear: string;
      scopeType?: 'all' | 'class' | 'section' | 'campus' | 'student';
      scopeValue?: string;
    },
    userId: string,
  ): Promise<Buffer> {
    if (!params.month) throw new BadRequestException('month is required');
    if (!params.academicYear) throw new BadRequestException('academicYear is required');

    const invoiceMatch: any = {
      schoolSlug, month: params.month, academicYear: params.academicYear, isDeleted: { $ne: true },
    };
    if (params.scopeType === 'class' && params.scopeValue) {
      invoiceMatch.grade = params.scopeValue;
    } else if (params.scopeType === 'section' && params.scopeValue) {
      const [g, s] = params.scopeValue.split('::');
      invoiceMatch.grade = g;
      if (s) invoiceMatch.section = s;
    } else if (params.scopeType === 'student' && params.scopeValue) {
      invoiceMatch.studentId = new Types.ObjectId(params.scopeValue);
    }

    let invoices: any[] = await this.invoiceModel.find(invoiceMatch).populate('studentId').lean();

    if (params.scopeType === 'campus' && params.scopeValue) {
      const campus = await this.campusModel.findOne({ schoolSlug, name: params.scopeValue }).lean();
      const campusId = campus ? String((campus as any)._id) : null;
      invoices = campusId
        ? invoices.filter((inv: any) => String(inv.studentId?.campusId || '') === campusId)
        : [];
    }

    if (invoices.length === 0) {
      throw new NotFoundException('No challans found for this scope/month - generate challans first under Fee Assignment');
    }

    const school: any = await this.getSchool(schoolSlug);
    const bankAccount: any = await this.bankAccountModel
      .findOne({ schoolSlug, isActive: true })
      .sort({ isPrimary: -1 })
      .lean();

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const logoImg = await this.embedSchoolLogo(pdfDoc, school);

    for (const invoice of invoices) {
      const data = this.buildChallanData(school, bankAccount, invoice);
      this.drawChallanPage(pdfDoc, data, logoImg, font, bold);
    }

    const bytes = await pdfDoc.save();
    const pdf = Buffer.from(bytes);

    await this.logPdf({
      schoolSlug,
      type: 'invoice',
      referenceId: params.scopeValue || 'bulk',
      referenceName: `Bulk challans - ${params.scopeType || 'all'} - ${params.month} (${invoices.length} students)`,
      generatedBy: userId,
      status: 'success',
      fileSizeKb: Math.round(pdf.length / 1024),
    });

    return pdf;
  }

  private async embedSchoolLogo(pdfDoc: any, school: any): Promise<any> {
    if (!school?.logo) return null;
    try {
      const res = await fetch(school.logo);
      if (!res.ok) return null;
      const bytes = await res.arrayBuffer();
      const isPng = school.logo.toLowerCase().includes('.png') || res.headers.get('content-type')?.includes('png');
      return isPng ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
    } catch {
      return null;
    }
  }

  private buildChallanData(school: any, bankAccount: any, invoice: any): any {
    const student: any = invoice.studentId;
    const father = (student?.guardians || []).find((g: any) => g.relation === 'father');
    const guardian = father || (student?.guardians || [])[0];

    const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');

    let issueDateLabel = 'N/A', validityLabel = 'N/A', monthLabel = invoice.academicYear || '';
    if (invoice.month) {
      const [y, m] = invoice.month.split('-').map(Number);
      if (y && m) {
        issueDateLabel = fmtDate(new Date(y, m - 1, 1));
        validityLabel = fmtDate(new Date(y, m, 0)); // last day of the billing month
        monthLabel = new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
      }
    }
    const dueDateLabel = invoice.dueDate ? fmtDate(new Date(invoice.dueDate)) : issueDateLabel;

    return {
      schoolName: school?.name || 'School',
      campusName: invoice.campus || 'N/A',
      bankName: bankAccount?.bankName || 'N/A',
      accountTitle: bankAccount?.accountTitle || school?.name || '',
      accountNumber: bankAccount?.accountNumber || '',
      invoiceNumber: invoice.invoiceNumber || `INV-${String(invoice._id).slice(-6).toUpperCase()}`,
      issueDateLabel,
      dueDateLabel,
      validityLabel,
      monthLabel,
      studentName: invoice.studentName || (student ? `${student.firstName || ''} ${student.lastName || ''}`.trim() : 'N/A'),
      admissionNumber: student?.admissionNumber || '',
      grade: invoice.grade || student?.currentGrade || '',
      section: invoice.section || student?.currentSection || '',
      guardianName: guardian?.name || '',
      items: (invoice.items || []).map((it: any) => ({
        description: it.description,
        netAmount: it.netAmount ?? (it.amount || 0) - (it.discount || 0),
      })),
      totalAmount: invoice.totalAmount || 0,
      lateFine: invoice.lateFine || 0,
    };
  }

  private drawChallanPage(pdfDoc: any, data: any, logoImg: any, font: any, bold: any) {
    const pageWidth = 842, pageHeight = 595; // landscape A4
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    const navy = rgb(0.047, 0.267, 0.486);
    const black = rgb(0.1, 0.1, 0.1);
    const gray = rgb(0.42, 0.42, 0.42);
    const lightGray = rgb(0.93, 0.93, 0.93);
    const red = rgb(0.7, 0.15, 0.15);

    const margin = 22;
    const gap = 16;
    const colWidth = (pageWidth - margin * 2 - gap * 2) / 3;
    const copyLabels = ['Bank Copy', 'School Copy', "Parent's Copy"];

    for (let i = 0; i < 3; i++) {
      const colX = margin + i * (colWidth + gap);
      let y = pageHeight - margin - 6;

      if (i > 0) {
        const sepX = colX - gap / 2;
        for (let yy = margin; yy < pageHeight - margin; yy += 6) {
          page.drawLine({ start: { x: sepX, y: yy }, end: { x: sepX, y: Math.min(yy + 3, pageHeight - margin) }, thickness: 0.75, color: gray });
        }
      }

      const logoSize = 26;
      const textX = logoImg ? colX + logoSize + 6 : colX;
      if (logoImg) {
        page.drawImage(logoImg, { x: colX, y: y - logoSize, width: logoSize, height: logoSize });
      }
      page.drawText(data.schoolName, { x: textX, y: y - 9, size: 9, font: bold, color: black, maxWidth: colWidth - (logoImg ? logoSize + 6 : 0) });
      page.drawText(`${data.campusName} Campus`, { x: textX, y: y - 19, size: 6.5, font, color: gray });
      page.drawText(data.bankName, { x: textX, y: y - 28, size: 6.5, font, color: gray });
      y -= logoSize + 8;

      page.drawText(`A/C Title: ${data.accountTitle}`, { x: colX, y, size: 6, font, color: gray, maxWidth: colWidth });
      y -= 9;
      page.drawText(`Account #: ${data.accountNumber || 'N/A'}`, { x: colX, y, size: 6, font, color: gray });
      y -= 10;

      page.drawLine({ start: { x: colX, y }, end: { x: colX + colWidth, y }, thickness: 0.5, color: gray });
      y -= 13;

      page.drawText('Fee Voucher', { x: colX, y, size: 8, font: bold, color: black });
      page.drawText(`Campus: ${data.campusName}`, { x: colX + 68, y, size: 6.5, font, color: black });
      const labelW = bold.widthOfTextAtSize(copyLabels[i], 8);
      page.drawText(copyLabels[i], { x: colX + colWidth - labelW, y, size: 8, font: bold, color: navy });
      y -= 13;

      const third = colWidth / 3;
      page.drawText('Issue Date:', { x: colX, y, size: 6, font, color: gray });
      page.drawText('Due Date:', { x: colX + third, y, size: 6, font, color: gray });
      page.drawText('Validity:', { x: colX + third * 2, y, size: 6, font, color: gray });
      y -= 9;
      page.drawText(data.issueDateLabel, { x: colX, y, size: 6.5, font: bold, color: black });
      page.drawText(data.dueDateLabel, { x: colX + third, y, size: 6.5, font: bold, color: black });
      page.drawText(data.validityLabel, { x: colX + third * 2, y, size: 6.5, font: bold, color: black });
      y -= 13;

      page.drawText(`Challan No: ${data.invoiceNumber}`, { x: colX, y, size: 7, font: bold, color: black });
      page.drawText(`GRN: ${data.admissionNumber || '-'}`, { x: colX + colWidth * 0.62, y, size: 7, font: bold, color: black });
      y -= 12;

      page.drawText(`Name: ${data.studentName}`, { x: colX, y, size: 7, font: bold, color: black, maxWidth: colWidth });
      y -= 11;
      page.drawText(`Father's Name: ${data.guardianName || '-'}`, { x: colX, y, size: 7, font, color: black, maxWidth: colWidth });
      y -= 11;
      page.drawText(`Class: ${data.grade}${data.section ? ' - ' + data.section : ''}`, { x: colX, y, size: 7, font, color: black });
      page.drawText(`For the month of: ${data.monthLabel}`, { x: colX + colWidth * 0.5, y, size: 6.5, font, color: black });
      y -= 13;

      page.drawRectangle({ x: colX, y: y - 10, width: colWidth, height: 12, color: lightGray });
      page.drawText('Description', { x: colX + 3, y: y - 8, size: 6.5, font: bold, color: black });
      page.drawText('Amount', { x: colX + colWidth - 38, y: y - 8, size: 6.5, font: bold, color: black });
      y -= 10;

      for (const item of data.items) {
        y -= 11;
        page.drawText(String(item.description || '').slice(0, 42), { x: colX + 3, y, size: 6.5, font, color: black });
        page.drawText((item.netAmount || 0).toLocaleString(), { x: colX + colWidth - 38, y, size: 6.5, font, color: black });
      }
      y -= 8;
      page.drawLine({ start: { x: colX, y }, end: { x: colX + colWidth, y }, thickness: 0.5, color: gray });
      y -= 12;

      page.drawText(`Payable by: ${data.dueDateLabel}`, { x: colX, y, size: 7, font: bold, color: black });
      page.drawText(data.totalAmount.toLocaleString(), { x: colX + colWidth - 38, y, size: 7, font: bold, color: black });
      y -= 12;

      if (data.lateFine > 0) {
        page.drawText(`After ${data.dueDateLabel}`, { x: colX, y, size: 7, font, color: red });
        page.drawText((data.totalAmount + data.lateFine).toLocaleString(), { x: colX + colWidth - 38, y, size: 7, font: bold, color: red });
      }

      page.drawText('Instructions:', { x: colX, y: margin + 22, size: 6.5, font: bold, color: black });
      page.drawText('Not Acceptable / Null & Void After Due Date', { x: colX, y: margin + 12, size: 6, font, color: gray });
    }
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

  // ============================================================
  // REPORT TEMPLATES — configurable letterhead/layout rendering
  // ============================================================

  /** Minimal hardcoded fallback so rendering never hard-fails for a
   *  school that hasn't seeded/configured any report templates yet. */
  private getDefaultTemplateObject(type: string): any {
    return {
      _id: null,
      schoolSlug: '',
      name: `Default ${type}`,
      type,
      isDefault: true,
      isActive: true,
      letterhead: {
        showLogo: true,
        logoPosition: 'left',
        logoSize: 'medium',
        schoolName: { show: true, fontSize: 20, bold: true, color: '#0C447C' },
        schoolAddress: { show: true, fontSize: 11 },
        schoolPhone: { show: true },
        schoolEmail: { show: true },
        schoolWebsite: { show: false },
        tagline: { show: false, text: '' },
        borderStyle: 'single',
        backgroundColor: '#ffffff',
        primaryColor: '#0C447C',
        accentColor: '#EF9F27',
      },
      header: {
        title: { show: true, text: this.titleForType(type), fontSize: 16, alignment: 'center' },
        subtitle: { show: false, text: '' },
        showDocumentNumber: true,
        showDate: true,
        showAcademicYear: false,
        customFields: [],
      },
      sections: [
        {
          id: 'default-table',
          type: 'table',
          order: 1,
          visible: true,
          config: {},
        },
        {
          id: 'default-signature',
          type: 'signature_block',
          order: 2,
          visible: true,
          config: {},
        },
      ],
      footer: {
        showPageNumber: false,
        showPrintDate: true,
        leftText: '',
        centerText: '',
        rightText: '',
        showSignatureLines: true,
        signatureLabels: [],
        showStampArea: false,
        borderTop: true,
      },
      page: {
        size: 'A4',
        orientation: 'portrait',
        marginTop: 15,
        marginBottom: 15,
        marginLeft: 15,
        marginRight: 15,
        watermark: { show: false, text: '', opacity: 0.08 },
      },
    };
  }

  private titleForType(type: string): string {
    const map: Record<string, string> = {
      fee_receipt: 'Fee Receipt',
      payment_voucher: 'Payment Voucher',
      journal_voucher: 'Journal Voucher',
      expense_voucher: 'Expense Voucher',
      payslip: 'Payslip',
      result_card: 'Result Card',
      attendance_sheet: 'Attendance Sheet',
      admission_letter: 'Admission Letter',
      custom: 'Document',
    };
    return map[type] || 'Document';
  }

  private async getTemplateForType(
    schoolSlug: string,
    type: string,
    templateId?: string,
  ): Promise<any> {
    if (templateId) {
      const byId = await this.reportTemplateModel
        .findOne({ _id: templateId, schoolSlug })
        .lean();
      if (byId) return byId;
    }

    const byDefault = await this.reportTemplateModel
      .findOne({ schoolSlug, type, isDefault: true, isActive: true })
      .lean();
    if (byDefault) return byDefault;

    return this.getDefaultTemplateObject(type);
  }

  private logoSizePx(size: string): string {
    switch (size) {
      case 'small': return '40px';
      case 'large': return '90px';
      default: return '64px';
    }
  }

  private buildLetterheadHtml(template: any, school: any): string {
    const lh = template.letterhead || {};
    const schoolNameCfg = lh.schoolName || {};
    const addrCfg = lh.schoolAddress || {};
    const phoneCfg = lh.schoolPhone || {};
    const emailCfg = lh.schoolEmail || {};
    const webCfg = lh.schoolWebsite || {};
    const taglineCfg = lh.tagline || {};

    const primaryColor = lh.primaryColor || '#0C447C';
    const accentColor = lh.accentColor || '#EF9F27';
    const bg = lh.backgroundColor || '#ffffff';

    let borderCss = 'none';
    switch (lh.borderStyle) {
      case 'single': borderCss = `border-bottom: 2px solid ${primaryColor};`; break;
      case 'double': borderCss = `border-bottom: 6px double ${primaryColor};`; break;
      case 'shadow': borderCss = `box-shadow: 0 4px 8px -4px rgba(0,0,0,0.25);`; break;
      default: borderCss = '';
    }

    const address = school.address
      ? [school.address.street, school.address.city, school.address.province, school.address.country]
          .filter(Boolean).join(', ')
      : '';

    const logoHtml = lh.showLogo && school.logo
      ? `<img src="${school.logo}" alt="logo" style="height:${this.logoSizePx(lh.logoSize)}; width:auto; object-fit:contain;" />`
      : '';

    const textBlock = `
      <div style="display:flex; flex-direction:column; gap:2px;">
        ${schoolNameCfg.show !== false ? `<div style="font-size:${schoolNameCfg.fontSize || 20}px; font-weight:${schoolNameCfg.bold !== false ? 700 : 400}; color:${schoolNameCfg.color || primaryColor};">${school.name || ''}</div>` : ''}
        ${addrCfg.show !== false && address ? `<div style="font-size:${addrCfg.fontSize || 11}px; color:#3D5A7A;">${address}</div>` : ''}
        <div style="font-size:11px; color:#3D5A7A; display:flex; gap:12px; flex-wrap:wrap;">
          ${phoneCfg.show !== false && school.phone ? `<span>Tel: ${school.phone}</span>` : ''}
          ${emailCfg.show !== false && school.email ? `<span>${school.email}</span>` : ''}
          ${webCfg.show === true && (school.social?.website || school.website) ? `<span>${school.social?.website || school.website}</span>` : ''}
        </div>
        ${taglineCfg.show ? `<div style="font-size:10px; font-style:italic; color:${accentColor};">${taglineCfg.text || ''}</div>` : ''}
      </div>`;

    const justify = lh.logoPosition === 'center' ? 'center' : lh.logoPosition === 'right' ? 'flex-end' : 'flex-start';
    const logoFirst = lh.logoPosition !== 'right';

    return `
      <div style="background:${bg}; ${borderCss} padding-bottom:12px; margin-bottom:14px;">
        <div style="display:flex; align-items:center; justify-content:${lh.logoPosition === 'center' ? 'center' : 'flex-start'}; gap:16px; flex-direction:${lh.logoPosition === 'center' ? 'column' : (logoFirst ? 'row' : 'row-reverse')}; text-align:${lh.logoPosition === 'center' ? 'center' : (lh.logoPosition === 'right' ? 'right' : 'left')};">
          ${logoHtml}
          ${textBlock}
        </div>
      </div>`;
  }

  private buildHeaderHtml(template: any, data: any): string {
    const header = template.header || {};
    const titleCfg = header.title || {};
    const subtitleCfg = header.subtitle || {};

    const docNumber = data.documentNumber || data.receiptNumber || data.voucherNumber
      || data.invoiceNumber || data.admissionNo || '';

    const dateStr = data.date || data.paymentDate || data.expenseDate || new Date().toLocaleDateString('en-GB');

    const customFieldsLeft = (header.customFields || [])
      .filter((f: any) => f.position !== 'right')
      .map((f: any) => `<span><strong>${f.label}:</strong> ${data[f.field] ?? ''}</span>`)
      .join(' &nbsp;&nbsp; ');

    const customFieldsRight = (header.customFields || [])
      .filter((f: any) => f.position === 'right')
      .map((f: any) => `<span><strong>${f.label}:</strong> ${data[f.field] ?? ''}</span>`)
      .join(' &nbsp;&nbsp; ');

    return `
      <div style="margin-bottom:16px;">
        ${titleCfg.show !== false ? `<div style="font-size:${titleCfg.fontSize || 16}px; font-weight:700; text-align:${titleCfg.alignment || 'center'}; text-transform:uppercase; letter-spacing:0.5px;">${titleCfg.text || this.titleForType(template.type)}</div>` : ''}
        ${subtitleCfg.show ? `<div style="font-size:12px; text-align:${titleCfg.alignment || 'center'}; color:#3D5A7A; margin-top:2px;">${subtitleCfg.text || ''}</div>` : ''}
        <div style="display:flex; justify-content:space-between; margin-top:10px; font-size:12px; color:#0D1F35;">
          <div>${customFieldsLeft}</div>
          <div style="display:flex; gap:16px;">
            ${header.showDocumentNumber !== false && docNumber ? `<span><strong>No:</strong> ${docNumber}</span>` : ''}
            ${header.showDate !== false ? `<span><strong>Date:</strong> ${dateStr}</span>` : ''}
            ${header.showAcademicYear && data.academicYear ? `<span><strong>Year:</strong> ${data.academicYear}</span>` : ''}
            ${customFieldsRight}
          </div>
        </div>
      </div>`;
  }

  private interpolate(content: string, data: any): string {
    return (content || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key) => {
      const val = key.split('.').reduce((acc: any, k: string) => (acc == null ? acc : acc[k]), data);
      return val != null ? String(val) : '';
    });
  }

  private buildSectionHtml(section: any, data: any): string {
    const config = section.config || {};

    switch (section.type) {
      case 'table': {
        const columns = config.columns && config.columns.length
          ? config.columns
          : [{ label: 'Description', field: 'description' }, { label: 'Amount', field: 'amount' }];
        const rows: any[] = config.dataKey ? (data[config.dataKey] || []) : (data.items || []);

        return `
          <table style="width:100%; border-collapse:collapse; margin-bottom:16px; font-size:13px;">
            <thead>
              <tr>
                ${columns.map((c: any, i: number) => `<th style="background:#1B4F8A; color:#fff; padding:8px 10px; text-align:${i === columns.length - 1 ? 'right' : 'left'}; font-size:11px; text-transform:uppercase;">${c.label}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${rows.map((row: any) => `
                <tr>
                  ${columns.map((c: any, i: number) => {
                    let val = row[c.field];
                    if (typeof val === 'number') val = val.toLocaleString();
                    return `<td style="padding:8px 10px; border-bottom:1px solid #EEF4FB; text-align:${i === columns.length - 1 ? 'right' : 'left'};">${val ?? ''}</td>`;
                  }).join('')}
                </tr>`).join('')}
            </tbody>
          </table>`;
      }

      case 'key_value': {
        const fields = config.fields && config.fields.length
          ? config.fields
          : Object.keys(data).slice(0, 6).map((k) => ({ label: k, field: k }));

        return `
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px 24px; margin-bottom:16px; font-size:13px;">
            ${fields.map((f: any) => `
              <div style="display:flex; justify-content:space-between; border-bottom:1px dotted #DDE8F4; padding-bottom:4px;">
                <span style="color:#7A9AB8; font-weight:600;">${f.label}</span>
                <span style="font-weight:600;">${data[f.field] ?? ''}</span>
              </div>`).join('')}
          </div>`;
      }

      case 'text': {
        const content = this.interpolate(config.content || '', data);
        return `<div style="font-size:13px; line-height:1.6; margin-bottom:16px;">${content}</div>`;
      }

      case 'signature_block': {
        const labels: string[] = (config.labels && config.labels.length) ? config.labels : ['Signature'];
        return `
          <div style="display:flex; justify-content:space-between; margin-top:36px; margin-bottom:16px;">
            ${labels.map((label: string) => `
              <div style="text-align:center;">
                <div style="width:140px; border-bottom:1.5px solid #0D1F35; height:32px;"></div>
                <div style="font-size:11px; color:#3D5A7A; font-weight:600; margin-top:4px;">${label}</div>
              </div>`).join('')}
          </div>`;
      }

      case 'divider': {
        const accent = config.color || '#EF9F27';
        return `<hr style="border:none; border-top:2px solid ${accent}; margin:16px 0;" />`;
      }

      case 'spacer': {
        const height = config.height || '20px';
        return `<div style="height:${typeof height === 'number' ? height + 'px' : height};"></div>`;
      }

      case 'qr_code': {
        const label = config.label || data.documentNumber || data.receiptNumber || data.voucherNumber || 'REF';
        return `
          <div style="display:flex; justify-content:${config.align || 'flex-end'}; margin-bottom:16px;">
            <div style="width:90px; height:90px; border:1px dashed #7A9AB8; display:flex; align-items:center; justify-content:center; text-align:center; font-size:9px; color:#7A9AB8; padding:4px;">
              QR<br/>${label}
            </div>
          </div>`;
      }

      default:
        return '';
    }
  }

  private buildFooterHtml(template: any, data: any): string {
    const footer = template.footer || {};
    const printDate = new Date().toLocaleDateString('en-GB');
    const labels: string[] = footer.signatureLabels && footer.signatureLabels.length
      ? footer.signatureLabels
      : [];

    return `
      <div style="margin-top:24px; ${footer.borderTop !== false ? 'border-top:1px solid #DDE8F4; padding-top:10px;' : ''}">
        ${footer.showSignatureLines && labels.length ? `
        <div style="display:flex; justify-content:space-between; margin-bottom:16px;">
          ${labels.map((label: string) => `
            <div style="text-align:center;">
              <div style="width:130px; border-bottom:1.5px solid #0D1F35; height:30px;"></div>
              <div style="font-size:10px; color:#3D5A7A; font-weight:600; margin-top:4px;">${label}</div>
            </div>`).join('')}
        </div>` : ''}
        ${footer.showStampArea ? `
        <div style="display:flex; justify-content:flex-end; margin-bottom:12px;">
          <div style="width:110px; height:80px; border:1px dashed #7A9AB8; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:9px; color:#7A9AB8;">Official Stamp</div>
        </div>` : ''}
        <div style="display:flex; justify-content:space-between; font-size:10px; color:#7A9AB8;">
          <span>${footer.leftText || ''}</span>
          <span>${footer.centerText || (footer.showPrintDate !== false ? `Printed on ${printDate}` : '')}</span>
          <span>${footer.rightText || ''}</span>
        </div>
      </div>`;
  }

  private mapPageSize(size: string): { widthMm: number; heightMm: number } {
    switch (size) {
      case 'A5': return { widthMm: 148, heightMm: 210 };
      case 'Letter': return { widthMm: 216, heightMm: 279 };
      case 'A4':
      default: return { widthMm: 210, heightMm: 297 };
    }
  }

  private buildPageWrapperCss(template: any): { css: string; widthMm: number; heightMm: number } {
    const page = template.page || {};
    let { widthMm, heightMm } = this.mapPageSize(page.size);
    if (page.orientation === 'landscape') {
      [widthMm, heightMm] = [heightMm, widthMm];
    }

    const mt = page.marginTop ?? 15;
    const mb = page.marginBottom ?? 15;
    const ml = page.marginLeft ?? 15;
    const mr = page.marginRight ?? 15;

    const watermark = page.watermark || {};
    const watermarkHtml = watermark.show
      ? `<div style="position:fixed; top:50%; left:50%; transform:translate(-50%,-50%) rotate(-35deg); font-size:70px; font-weight:900; color:rgba(0,0,0,${watermark.opacity ?? 0.08}); letter-spacing:4px; white-space:nowrap; pointer-events:none; z-index:0;">${watermark.text || ''}</div>`
      : '';

    const css = `
      * { box-sizing: border-box; }
      body { font-family: 'Segoe UI', Arial, sans-serif; color: #0D1F35; margin:0; padding:0; }
      .page { width: ${widthMm}mm; min-height: ${heightMm}mm; padding: ${mt}mm ${mr}mm ${mb}mm ${ml}mm; position: relative; }
      .page-content { position: relative; z-index: 1; }
    `;

    return { css: `<style>${css}</style>${watermarkHtml}`, widthMm, heightMm };
  }

  /**
   * Composes a full HTML document (letterhead + header + sorted visible
   * sections + footer) driven by a ReportTemplate and renders it to PDF.
   */
  async generateFromTemplate(
    schoolSlug: string,
    type: string,
    data: any,
    userId: string,
    templateId?: string,
  ): Promise<Buffer> {
    const school = await this.getSchool(schoolSlug);
    const template = await this.getTemplateForType(schoolSlug, type, templateId);

    const letterheadHtml = this.buildLetterheadHtml(template, school);
    const headerHtml = this.buildHeaderHtml(template, data);

    const sections = (template.sections || [])
      .filter((s: any) => s.visible !== false)
      .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));

    const sectionsHtml = sections.map((s: any) => this.buildSectionHtml(s, data)).join('');
    const footerHtml = this.buildFooterHtml(template, data);

    const { css, widthMm, heightMm } = this.buildPageWrapperCss(template);

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
${css}
</head>
<body>
  <div class="page">
    <div class="page-content">
      ${letterheadHtml}
      ${headerHtml}
      ${sectionsHtml}
      ${footerHtml}
    </div>
  </div>
</body>
</html>`;

    const page = template.page || {};
    const pdf = await this.htmlToPdfWithOptions(html, {
      width: `${widthMm}mm`,
      height: `${heightMm}mm`,
      landscape: page.orientation === 'landscape',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });

    await this.logPdf({
      schoolSlug,
      type,
      referenceId: templateId || (template._id ? String(template._id) : ''),
      referenceName: data.documentNumber || data.receiptNumber || data.voucherNumber || template.name || type,
      generatedBy: userId,
      status: 'success',
      fileSizeKb: Math.round(pdf.length / 1024),
    });

    return pdf;
  }

  /** Loads a Payment (with invoice/student context) and renders a fee receipt. */
  /**
   * Generates the payment receipt as a real PDF using pdf-lib. Previously
   * routed through generateFromTemplate (Puppeteer/HTML - broken on
   * Railway) and read field names that don't exist on the real Payment
   * schema (receiptNo instead of receiptNumber, method instead of
   * paymentMethod, invoice.invoiceNo/gradeLevelName/admissionNo instead of
   * invoiceNumber/grade/admissionNumber) - so this was generating with
   * blank data even before the Railway move.
   */
  async generateFeeReceipt(
    schoolSlug: string,
    dto: { paymentId: string; templateId?: string },
    userId: string,
  ): Promise<Buffer> {
    const school: any = await this.getSchool(schoolSlug);
    const payment: any = await this.paymentModel
      .findOne({ _id: dto.paymentId, schoolSlug })
      .populate('invoiceId')
      .populate('studentId')
      .lean();
    if (!payment) throw new NotFoundException('Payment not found');

    const invoice: any = payment.invoiceId;
    const student: any = payment.studentId;
    const father = (student?.guardians || []).find((g: any) => g.relation === 'father');
    const guardian = father || (student?.guardians || [])[0];

    const items = (invoice?.items || []).map((it: any) => ({
      description: it.description,
      amount: it.amount,
    }));

    const data = {
      schoolName: school?.name || 'School',
      receiptNumber: payment.receiptNumber || `RCP-${String(dto.paymentId).slice(-6).toUpperCase()}`,
      paymentDate: payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB'),
      studentName: payment.studentName || (student ? `${student.firstName || ''} ${student.lastName || ''}`.trim() : ''),
      grade: invoice?.grade || student?.currentGrade || '',
      section: invoice?.section || student?.currentSection || '',
      admissionNumber: student?.admissionNumber || '',
      guardianName: guardian?.name || '',
      invoiceNumber: invoice?.invoiceNumber || '',
      items: items.length ? items : [{ description: 'Payment', amount: payment.amount || 0 }],
      amount: payment.amount || 0,
      paymentMethod: (payment.paymentMethod || 'cash').replace('_', ' '),
      transactionId: payment.transactionId || payment.chequeNumber || 'N/A',
      collectedBy: payment.collectedBy || '',
    };

    const pdf = await this.renderReceiptPdf(data);

    await this.logPdf({
      schoolSlug,
      type: 'fee_receipt',
      referenceId: dto.paymentId,
      referenceName: `${data.receiptNumber} - ${data.studentName}`,
      generatedBy: userId,
      status: 'success',
      fileSizeKb: Math.round(pdf.length / 1024),
    });

    return pdf;
  }

  private async renderReceiptPdf(data: any): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([420, 560]); // roughly A5 - a receipt doesn't need a full A4 sheet
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const navy = rgb(0.047, 0.267, 0.486);
    const grayText = rgb(0.45, 0.45, 0.45);
    const black = rgb(0.1, 0.1, 0.1);
    const lightGray = rgb(0.93, 0.93, 0.93);
    const margin = 32;
    const width = 420;
    let y = 560 - margin;

    page.drawRectangle({ x: 0, y: y - 30, width, height: 40, color: navy });
    page.drawText(data.schoolName, { x: margin, y: y - 18, size: 13, font: bold, color: rgb(1, 1, 1), maxWidth: width - margin * 2 });
    y -= 55;

    page.drawText('PAYMENT RECEIPT', { x: margin, y, size: 12, font: bold, color: navy });
    page.drawText(data.receiptNumber, { x: width - margin - bold.widthOfTextAtSize(data.receiptNumber, 10), y, size: 10, font: bold, color: black });
    y -= 22;

    const row = (label: string, value: string) => {
      page.drawText(label, { x: margin, y, size: 9, font, color: grayText });
      page.drawText(value || '—', { x: margin + 110, y, size: 9, font: bold, color: black, maxWidth: width - margin * 2 - 110 });
      y -= 16;
    };
    row('Date', data.paymentDate);
    row('Student', data.studentName);
    row('Class', `${data.grade}${data.section ? ' - ' + data.section : ''}`);
    row('GR No', data.admissionNumber);
    if (data.guardianName) row('Guardian', data.guardianName);
    if (data.invoiceNumber) row('Against Invoice', data.invoiceNumber);
    y -= 4;

    page.drawRectangle({ x: margin, y: y - 12, width: width - margin * 2, height: 14, color: lightGray });
    page.drawText('Description', { x: margin + 6, y: y - 9, size: 8, font: bold, color: black });
    page.drawText('Amount (PKR)', { x: width - margin - 90, y: y - 9, size: 8, font: bold, color: black });
    y -= 12;
    for (const item of data.items) {
      y -= 14;
      page.drawText(String(item.description || 'Payment').slice(0, 42), { x: margin + 6, y, size: 8.5, font, color: black });
      page.drawText((item.amount || 0).toLocaleString(), { x: width - margin - 90, y, size: 8.5, font, color: black });
    }
    y -= 10;
    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: grayText });
    y -= 18;

    page.drawText('Total Received:', { x: margin, y, size: 11, font: bold, color: black });
    page.drawText(`PKR ${(data.amount || 0).toLocaleString()}`, { x: width - margin - 100, y, size: 12, font: bold, color: navy });
    y -= 22;

    row('Payment Method', data.paymentMethod);
    row('Reference / Cheque #', data.transactionId);
    if (data.collectedBy) row('Collected By', data.collectedBy);

    y -= 20;
    page.drawText('Signature: ____________________', { x: margin, y, size: 9, font, color: black });
    page.drawText('Stamp: ____________________', { x: margin + 220, y, size: 9, font, color: black });

    y -= 24;
    page.drawText('This is a computer-generated receipt.', { x: margin, y, size: 7, font, color: grayText });

    const bytes = await pdfDoc.save();
    return Buffer.from(bytes);
  }

  /**
   * Loads an Expense (for expense/payment vouchers) or accepts ad-hoc
   * voucherData for journal vouchers etc., then renders the voucher.
   */
  async generateVoucher(
    schoolSlug: string,
    dto: { expenseId?: string; voucherData?: any; templateId?: string; type?: string },
    userId: string,
  ): Promise<Buffer> {
    let data: any;

    if (dto.expenseId) {
      const expense = await this.expenseModel.findOne({ _id: dto.expenseId }).lean();
      if (!expense) throw new NotFoundException('Expense not found');

      data = {
        documentNumber: (expense as any).expenseNo,
        voucherNumber: (expense as any).expenseNo,
        date: (expense as any).expenseDate
          ? new Date((expense as any).expenseDate).toLocaleDateString('en-GB')
          : new Date().toLocaleDateString('en-GB'),
        debitAccount: (expense as any).category || 'Expense',
        creditAccount: 'Cash / Bank',
        amount: (expense as any).amount,
        currency: (expense as any).currency || 'PKR',
        narration: (expense as any).description,
        paidTo: (expense as any).paidTo,
        rows: [
          { account: (expense as any).category || 'Expense', debit: (expense as any).amount, credit: 0 },
          { account: 'Cash / Bank', debit: 0, credit: (expense as any).amount },
        ],
        preparedBy: '',
        approvedBy: '',
        items: [{ description: (expense as any).description, amount: (expense as any).amount }],
      };
    } else {
      data = dto.voucherData || {};
    }

    return this.generateFromTemplate(
      schoolSlug,
      dto.type || 'payment_voucher',
      data,
      userId,
      dto.templateId,
    );
  }
}
