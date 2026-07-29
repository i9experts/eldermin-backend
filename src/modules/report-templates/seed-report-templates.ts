// ============================================================
// SEED: Default Report Templates (Fee Receipt + Payment Voucher)
// Eldermin ERP | run with: npm run seed:report-templates
// ============================================================

import { webcrypto } from 'crypto';
(global as any).crypto = webcrypto;

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { getModelToken } from '@nestjs/mongoose';

async function seedReportTemplates() {
  console.log('Starting report templates seed...');
  const app = await NestFactory.createApplicationContext(AppModule);

  const schoolModel = app.get(getModelToken('School'));
  const reportTemplateModel = app.get(getModelToken('ReportTemplate'));

  const schools = await schoolModel.find().lean();

  if (!schools.length) {
    console.log('No schools found. Nothing to seed.');
    await app.close();
    process.exit(0);
  }

  for (const school of schools) {
    const schoolSlug = (school as any).slug;

    // ── Fee Receipt ────────────────────────────────────────────
    const existingReceipt = await reportTemplateModel.findOne({
      schoolSlug,
      type: 'fee_receipt',
      isDefault: true,
    });

    if (!existingReceipt) {
      await reportTemplateModel.create({
        schoolSlug,
        name: 'Standard Fee Receipt',
        type: 'fee_receipt',
        isDefault: true,
        isActive: true,
        letterhead: {
          showLogo: true,
          logoPosition: 'left',
          logoSize: 'medium',
          schoolName: { show: true, fontSize: 22, bold: true, color: '#0C447C' },
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
          title: { show: true, text: 'Fee Receipt', fontSize: 18, alignment: 'center' },
          subtitle: { show: false, text: '' },
          showDocumentNumber: true,
          showDate: true,
          showAcademicYear: true,
          customFields: [],
        },
        sections: [
          {
            id: 'student-info',
            type: 'key_value',
            order: 1,
            visible: true,
            config: {
              fields: [
                { label: 'Student Name', field: 'studentName' },
                { label: 'Class', field: 'grade' },
                { label: 'GR No', field: 'rollNumber' },
                { label: "Father's Name", field: 'fatherName' },
              ],
            },
          },
          {
            id: 'fee-items',
            type: 'table',
            order: 2,
            visible: true,
            config: {
              dataKey: 'items',
              columns: [
                { label: 'Fee Head', field: 'description' },
                { label: 'Amount', field: 'amount' },
              ],
            },
          },
          {
            id: 'payment-info',
            type: 'key_value',
            order: 3,
            visible: true,
            config: {
              fields: [
                { label: 'Payment Method', field: 'paymentMethod' },
                { label: 'Reference', field: 'transactionRef' },
                { label: 'Payment Date', field: 'paymentDate' },
              ],
            },
          },
        ],
        footer: {
          showPageNumber: false,
          showPrintDate: true,
          leftText: '',
          centerText: '',
          rightText: '',
          showSignatureLines: true,
          signatureLabels: ['Received By'],
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
      });
      console.log(`[${schoolSlug}] Created: Standard Fee Receipt`);
    } else {
      console.log(`[${schoolSlug}] Skipped: fee_receipt default already exists`);
    }

    // ── Payment Voucher ────────────────────────────────────────
    const existingVoucher = await reportTemplateModel.findOne({
      schoolSlug,
      type: 'payment_voucher',
      isDefault: true,
    });

    if (!existingVoucher) {
      await reportTemplateModel.create({
        schoolSlug,
        name: 'Payment Voucher',
        type: 'payment_voucher',
        isDefault: true,
        isActive: true,
        letterhead: {
          showLogo: true,
          logoPosition: 'left',
          logoSize: 'medium',
          schoolName: { show: true, fontSize: 22, bold: true, color: '#0C447C' },
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
          title: { show: true, text: 'Payment Voucher', fontSize: 18, alignment: 'center' },
          subtitle: { show: false, text: '' },
          showDocumentNumber: true,
          showDate: true,
          showAcademicYear: false,
          customFields: [],
        },
        sections: [
          {
            id: 'voucher-meta',
            type: 'key_value',
            order: 1,
            visible: true,
            config: {
              fields: [
                { label: 'Voucher No.', field: 'voucherNumber' },
                { label: 'Date', field: 'date' },
                { label: 'Department', field: 'department' },
              ],
            },
          },
          {
            id: 'debit-credit-table',
            type: 'table',
            order: 2,
            visible: true,
            config: {
              dataKey: 'rows',
              columns: [
                { label: 'Account', field: 'account' },
                { label: 'Debit', field: 'debit' },
                { label: 'Credit', field: 'credit' },
              ],
            },
          },
          {
            id: 'signatures',
            type: 'signature_block',
            order: 3,
            visible: true,
            config: {
              labels: ['Prepared By', 'Checked By', 'Approved By'],
            },
          },
        ],
        footer: {
          showPageNumber: false,
          showPrintDate: true,
          leftText: '',
          centerText: '',
          rightText: '',
          showSignatureLines: false,
          signatureLabels: [],
          showStampArea: true,
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
      });
      console.log(`[${schoolSlug}] Created: Payment Voucher`);
    } else {
      console.log(`[${schoolSlug}] Skipped: payment_voucher default already exists`);
    }
  }

  console.log('Report templates seed complete.');
  await app.close();
  process.exit(0);
}

seedReportTemplates().catch((err) => {
  console.error('Report templates seed failed:', err);
  process.exit(1);
});
