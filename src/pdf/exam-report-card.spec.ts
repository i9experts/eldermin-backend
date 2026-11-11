import { PdfService } from './pdf.service';

// Regression coverage for PdfService.generateExamReportCardPdf - the
// per-exam "print preview before publishing" PDF, separate from
// generateReportCard (which is actually the whole-TERM report, see
// report-card.spec.ts). Deliberately has no published check.

function makeService(overrides: { school?: any; reportCard?: any; student?: any; visibilitySettings?: any }) {
  const n: any = {};
  const studentModel: any = { findOne: () => ({ select: () => ({ lean: () => Promise.resolve(overrides.student ?? null) }) }) };
  const schoolModel: any = { findOne: () => ({ lean: () => Promise.resolve(overrides.school) }) };
  const reportCardModel: any = {
    findOne: () => ({ lean: () => Promise.resolve(overrides.reportCard ?? null) }),
  };
  const visibilitySettingsModel: any = { findOne: () => ({ lean: () => Promise.resolve(overrides.visibilitySettings ?? null) }) };
  // positions: pdfLog,student,invoice,school,assessment,behaviour,reportTemplate,
  // payment,expense,bankAccount,campus,groupInstitution,qaida,tarbiyah,
  // characterSettings,financeService,termReportCard,reportCard,visibilitySettings
  const args = [n, studentModel, n, schoolModel, n, n, n, n, n, n, n, n, n, n, n, n, n, reportCardModel, visibilitySettingsModel];
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

  it('shows the school\'s custom Pass/Fail wording from Assessment Master Settings', async () => {
    const { service, getHtml } = makeService({
      school: SCHOOL,
      reportCard: { ...REPORT_CARD, overallResult: 'fail' },
      visibilitySettings: { passLabel: 'Promoted', failLabel: 'Needs Improvement' },
    });
    await service.generateExamReportCardPdf('demo-school', { assessmentId: 'a1', studentId: 's1' } as any, 'user1');
    expect(getHtml()).toContain('Needs Improvement');
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
    expect(html).toContain('.content { padding: 0 16mm; }');
    expect(html).toContain('.sig-row { display: flex; justify-content: space-between; margin-top: 18px; padding-top: 4px; }');
    expect(html).not.toContain('padding: 14mm 16mm 16mm');
    expect(html).not.toContain('margin-top: 36px');
  });

  // Root cause behind every one of this report's page-bleed reports, even
  // after trimming the content spacing above: htmlToPdf() renders with a
  // 10mm top + 10mm bottom Puppeteer page margin, so the real printable
  // area on an A4 page is only 297mm - 20mm = 277mm tall - but this
  // template's own `.page` div declared `min-height: 297mm` (the full,
  // un-inset page size), forcing it to be at least 20mm taller than what
  // actually fits, which alone guarantees a near-blank continuation page
  // on every single print regardless of how little content there was.
  it("sizes .page's min-height to the printable area (pageHeight minus the Puppeteer margin), not the raw A4 page size", async () => {
    const { service, getHtml } = makeService({ school: SCHOOL, reportCard: REPORT_CARD });
    await service.generateExamReportCardPdf('demo-school', { assessmentId: 'a1', studentId: 's1' } as any, 'user1');
    const html = getHtml();
    expect(html).toContain('.page { width: 210mm; min-height: 277mm; position: relative; }');
    expect(html).not.toContain('min-height: 297mm');
  });

  // A student with a larger subject load than the 2-subject fixture above
  // reported the same bleed: the table alone pushed the fixed-size score
  // ring/tiles/class-average/signature sections below it onto a second,
  // near-empty page. The one-size spacing trim above was tuned against a
  // short table and doesn't hold as the real subject count grows, so row
  // spacing/font-size and the fixed sections' margins now shrink in
  // proportion to how many subjects exceed the untouched baseline.
  it('shrinks table row spacing and trims section margins as the subject count grows past the baseline, to keep a many-subject report on one page', async () => {
    const manySubjects = Array.from({ length: 10 }, (_, i) => ({
      subject: `Subject ${i + 1}`, obtainedMarks: 25, totalMarks: 30, percentage: 83.3, grade: 'A',
    }));
    const { service, getHtml } = makeService({ school: SCHOOL, reportCard: { ...REPORT_CARD, subjects: manySubjects } });
    await service.generateExamReportCardPdf('demo-school', { assessmentId: 'a1', studentId: 's1' } as any, 'user1');
    const html = getHtml();
    // 10 subjects is 6 over the 4-subject baseline, so td/th padding and the
    // signature row's margin-top must all be pulled in below their baseline
    // (unshrunk) values.
    expect(html).toMatch(/td \{ padding: (?!7px)[0-9.]+px 12px;/);
    expect(html).toMatch(/th \{ background: #1B4F8A; color: #fff; padding: (?!7px)[0-9.]+px 12px;/);
    expect(html).toMatch(/\.sig-row \{ display: flex; justify-content: space-between; margin-top: (?!18px)[0-9.]+px;/);
  });

  // A report at exactly the old 6-subject baseline measured out to within a
  // fraction of a millimeter of the 277mm printable-area limit - no real
  // margin at all, so any small real-world variance (a longer assessment
  // title, slightly different font metrics) was enough to tip it onto a
  // near-blank 2nd page even though this exact combination had "passed"
  // every earlier page-count check. The baseline that keeps the original,
  // unshrunk spacing is now only the first 4 subjects, giving every report
  // real breathing room instead of being tuned to the exact edge.
  it('keeps the untouched baseline spacing for a report at or under the 4-subject baseline', async () => {
    const fourSubjects = Array.from({ length: 4 }, (_, i) => ({
      subject: `Subject ${i + 1}`, obtainedMarks: 25, totalMarks: 30, percentage: 83.3, grade: 'A',
    }));
    const { service, getHtml } = makeService({ school: SCHOOL, reportCard: { ...REPORT_CARD, subjects: fourSubjects } });
    await service.generateExamReportCardPdf('demo-school', { assessmentId: 'a1', studentId: 's1' } as any, 'user1');
    const html = getHtml();
    expect(html).toContain('td { padding: 7px 12px; border-bottom: 1px solid #EEF4FB; vertical-align: middle; }');
    expect(html).toContain('.sig-row { display: flex; justify-content: space-between; margin-top: 18px; padding-top: 4px; }');
  });

  // A long assessment title (e.g. combining term, type, grade and year)
  // used to wrap onto a 2nd line inside the fixed-width doc-title box,
  // silently adding header height that no part of the subject-count-based
  // overflow math accounted for. Truncate instead of wrapping.
  it('truncates a long assessment title instead of letting it wrap onto a 2nd header line', async () => {
    const longTitle = 'Term 1 - Summative Assessment, Grade 7 - Academic Year 2026-27 (Final)';
    const { service, getHtml } = makeService({ school: SCHOOL, reportCard: { ...REPORT_CARD, assessmentTitle: longTitle } });
    await service.generateExamReportCardPdf('demo-school', { assessmentId: 'a1', studentId: 's1' } as any, 'user1');
    const html = getHtml();
    expect(html).toContain('white-space: nowrap; overflow: hidden; text-overflow: ellipsis;');
  });
});
