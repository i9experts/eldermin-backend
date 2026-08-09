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
            // Field names here must match what generateFeeReceipt() in
            // pdf.service.ts actually populates on a real payment (student
            // name/grade/section, admissionNumber, guardianName - not the
            // "rollNumber"/"fatherName" this used to say, which don't exist
            // on the real Payment/Student data and would always render
            // blank on an actual receipt).
            fields: [
              { label: 'Student Name', field: 'studentName' },
              { label: 'Class', field: 'grade' },
              { label: 'Section', field: 'section' },
              { label: 'GR No', field: 'admissionNumber' },
              { label: 'Guardian', field: 'guardianName' },
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
              { label: 'Against Invoice', field: 'invoiceNumber' },
              { label: 'Payment Method', field: 'paymentMethod' },
              { label: 'Reference / Cheque #', field: 'transactionId' },
              { label: 'Payment Date', field: 'paymentDate' },
              { label: 'Total Received (PKR)', field: 'amount' },
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
    {
      // Field names here match what generateReportCard() in pdf.service.ts
      // actually populates for a real student (studentName/grade/section/
      // rollNumber/dob/attendance, a `subjects` array, computed
      // totalMarks/totalObtained/overallPct/overallGrade, an optional
      // `tarbiyah` behaviour-trait array, and free-text `remarks`).
      schoolSlug,
      name: 'Standard Result Card',
      type: 'result_card',
      isDefault: true,
      isActive: true,
      letterhead: {
        showLogo: true,
        logoPosition: 'center',
        logoSize: 'medium',
        schoolName: { show: true, fontSize: 22, bold: true, color: '#0C447C' },
        schoolAddress: { show: true, fontSize: 11 },
        schoolPhone: { show: false },
        schoolEmail: { show: false },
        schoolWebsite: { show: false },
        tagline: { show: false, text: '' },
        borderStyle: 'double',
        backgroundColor: '#ffffff',
        primaryColor: '#0C447C',
        accentColor: '#EF9F27',
      },
      header: {
        title: { show: true, text: 'Result Card', fontSize: 18, alignment: 'center' },
        subtitle: { show: false, text: '' },
        showDocumentNumber: false,
        showDate: true,
        showAcademicYear: true,
        customFields: [
          { label: 'Term', field: 'term', position: 'left' },
        ],
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
              { label: 'Section', field: 'section' },
              { label: 'Roll No', field: 'rollNumber' },
              { label: 'Date of Birth', field: 'dob' },
              { label: 'Attendance', field: 'attendance' },
            ],
          },
        },
        {
          id: 'marks-table',
          type: 'table',
          order: 2,
          visible: true,
          config: {
            dataKey: 'subjects',
            columns: [
              { label: 'Subject', field: 'subjectName' },
              { label: 'Total Marks', field: 'totalMarks' },
              { label: 'Obtained Marks', field: 'obtainedMarks' },
            ],
          },
        },
        {
          id: 'result-summary',
          type: 'key_value',
          order: 3,
          visible: true,
          config: {
            fields: [
              { label: 'Total Marks', field: 'totalMarks' },
              { label: 'Marks Obtained', field: 'totalObtained' },
              { label: 'Percentage', field: 'overallPct' },
              { label: 'Grade', field: 'overallGrade' },
            ],
          },
        },
        {
          id: 'tarbiyah-table',
          type: 'table',
          order: 4,
          visible: true,
          config: {
            dataKey: 'tarbiyah',
            columns: [
              { label: 'Tarbiyah / Behaviour Trait', field: 'trait' },
              { label: 'Score', field: 'score' },
            ],
          },
        },
        {
          id: 'remarks',
          type: 'text',
          order: 5,
          visible: true,
          config: {
            content: 'Remarks: {{remarks}}',
            fontSize: 12,
            bold: false,
            italic: true,
            color: '#3D5A7A',
            alignment: 'left',
          },
        },
        {
          id: 'signatures',
          type: 'signature_block',
          order: 6,
          visible: true,
          config: {
            labels: ['Class Teacher', 'Principal'],
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
