// ============================================================
// SHARED DEFAULT REPORT TEMPLATES — Fee Receipt + Payment Voucher
// Eldermin ERP | NestJS
//
// Single source of truth for the two starter templates every school should
// have. Used by:
//   1. seed-report-templates.ts — the standalone `npm run seed:report-
//      templates` script, for backfilling schools that onboarded before
//      this existed.
//   2. OnboardingService.complete() — so every NEWLY onboarded school gets
//      these automatically, instead of relying on someone remembering to
//      run the script by hand against production. Before this, a school's
//      "Report Templates" list under Intelligence was silently empty until
//      a developer manually seeded it — a real (if forgiving, since
//      generateFromTemplate has its own in-code fallback) gap in what a
//      newly signed-up school actually gets out of the box.
// ============================================================

export function defaultReportTemplates(schoolSlug: string) {
  return [
    {
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
    },
    {
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
    },
  ];
}
