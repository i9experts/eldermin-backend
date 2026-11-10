import { PdfService } from './pdf.service';

// Regression coverage for PdfService.generateExamReportCardPdf - the
// per-exam "print preview before publishing" PDF, separate from
// generateReportCard (which is actually the whole-TERM report, see
// report-card.spec.ts). Deliberately has no published check.

function makeService(overrides: { school?: any; reportCard?: any; student?: any }) {
  const n: any = {};
  const studentModel: any = { findOne: () => ({ select: () => ({ lean: () => Promise.resolve(overrides.student ?? null) }) }) };
  const schoolModel: any = { findOne: () => ({ lean: () => Promise.resolve(overrides.school) }) };
  const reportCardModel: any = {
    findOne: () => ({ lean: () => Promise.resolve(overrides.reportCard ?? null) }),
  };
  // positions: pdfLog,student,invoice,school,assessment,behaviour,reportTemplate,
  // payment,expense,bankAccount,campus,groupInstitution,qaida,tarbiyah,
  // characterSettings,financeService,termReportCard,reportCard
  const args = [n, studentModel, n, schoolModel, n, n, n, n, n, n, n, n, n, n, n, n, n, reportCardModel];
  const PdfServiceAny: any = PdfService;
  const service = new PdfServiceAny(...args) as PdfService;
  let capturedHtml = '';
  jest.spyOn(service as any, 'htmlToPdf').mockImplementation(async (html: any) => {
    capturedHtml = html;
    return Buffer.from('fake-pdf');
  });
  jest.spyOn(service as any, 'logPdf').mockResolvedValue(undefined);
  return { service, getHtml: () => capturedHtml };
}

const SCHOOL = { name: 'The Deenway School', address: { street: '12 Main Road', city: 'Karachi' } };

const REPORT_CARD = {
  assessmentTitle: 'Term-1-Grade-1-Summative Assessment',
  academicYear: '2025-26', term: 'Term 1',
  studentName: 'Ayesha Khan', rollNumber: 'R-101', grade: 'Grade 1', section: 'A',
  subjects: [
    { subject: 'Math', obtainedMarks: 90, totalMarks: 100, percentage: 90, grade: 'A+' },
    { subject: 'Science', obtainedMarks: 70, totalMarks: 100, percentage: 70, grade: 'B' },
  ],
  totalObtainedMarks: 160, totalMaxMarks: 200, overallPercentage: 80, overallGrade: 'A', overallGPA: 3.7,
  overallResult: 'pass', classPosition: 2, totalStudents: 25, classAveragePercentage: 72.4,
  classTeacherRemarks: 'Great improvement this term.',
  published: false,
};

describe('PdfService.generateExamReportCardPdf', () => {
  it('renders the per-exam subject marks, totals and a Draft badge when not yet published', async () => {
    const { service, getHtml } = makeService({ school: SCHOOL, reportCard: REPORT_CARD });
    await service.generateExamReportCardPdf('demo-school', { assessmentId: 'a1', studentId: 's1' } as any, 'user1');
    const html = getHtml();
    expect(html).toContain('Math');
    expect(html).toContain('90%');
    expect(html).toContain('160'); // totalObtainedMarks
    expect(html).toContain('80%'); // overallPercentage
    expect(html).toContain('Draft');
    expect(html).toContain('Great improvement this term.');
  });

  it('omits the Draft badge once the report card is published', async () => {
    const { service, getHtml } = makeService({ school: SCHOOL, reportCard: { ...REPORT_CARD, published: true } });
    await service.generateExamReportCardPdf('demo-school', { assessmentId: 'a1', studentId: 's1' } as any, 'user1');
    expect(getHtml()).not.toContain('Draft · Not Yet Published');
  });

  it('throws a clear error when no report card exists for this assessment/student yet', async () => {
    const { service } = makeService({ school: SCHOOL, reportCard: null });
    await expect(service.generateExamReportCardPdf('demo-school', { assessmentId: 'a1', studentId: 's1' } as any, 'user1'))
      .rejects.toThrow(/generate report cards/i);
  });

  it('escapes free-text remarks to prevent HTML injection', async () => {
    const malicious = { ...REPORT_CARD, classTeacherRemarks: '<script>alert(1)</script>' };
    const { service, getHtml } = makeService({ school: SCHOOL, reportCard: malicious });
    await service.generateExamReportCardPdf('demo-school', { assessmentId: 'a1', studentId: 's1' } as any, 'user1');
    expect(getHtml()).not.toContain('<script>alert(1)</script>');
    expect(getHtml()).toContain('&lt;script&gt;');
  });

  // A school reported the per-exam report card PDF spilling its signature
  // row + footer onto an otherwise-blank second page. The template's own
  // vertical spacing (content padding, header/section margins, table row
  // padding, and especially the signature row's margin-top) was tightened
  // so a single student/single-exam report fits on one A4 page; pin the
  // tightened values here so they aren't casually widened back out.
  it('uses the tightened one-page spacing (content padding, table row padding, signature row margin) instead of the old wider values that bled onto a second page', async () => {
    const { service, getHtml } = makeService({ school: SCHOOL, reportCard: REPORT_CARD });
    await service.generateExamReportCardPdf('demo-school', { assessmentId: 'a1', studentId: 's1' } as any, 'user1');
    const html = getHtml();
    expect(html).toContain('.content { padding: 10mm 16mm 10mm; }');
    expect(html).toContain('.sig-row { display: flex; justify-content: space-between; margin-top: 18px; padding-top: 4px; }');
    expect(html).not.toContain('padding: 14mm 16mm 16mm');
    expect(html).not.toContain('margin-top: 36px');
  });
});
