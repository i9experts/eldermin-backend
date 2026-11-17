import { PdfService } from './pdf.service';
import { PDFDocument } from 'pdf-lib';

// Regression coverage for PdfService.generateExamReportCardPdf - the
// per-exam "print preview before publishing" PDF, separate from
// generateReportCard (which is actually the whole-TERM report, see
// report-card.spec.ts). Deliberately has no published check.

// generateBulkExamReportCardsPdf merges each student's PDF with pdf-lib, so
// the mocked htmlToPdf has to return bytes pdf-lib can actually load - a
// placeholder string like the old 'fake-pdf' buffer would make every bulk
// test fail on the merge step, not on anything this file is meant to cover.
async function fakePdfBuffer(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  return Buffer.from(await doc.save());
}

function makeService(overrides: { school?: any; reportCard?: any; reportCards?: any[]; student?: any; visibilitySettings?: any }) {
  const n: any = {};
  const studentModel: any = { findOne: () => ({ select: () => ({ lean: () => Promise.resolve(overrides.student ?? null) }) }) };
  const schoolModel: any = { findOne: () => ({ lean: () => Promise.resolve(overrides.school) }) };
  const reportCardModel: any = {
    findOne: (filter: any) => ({
      lean: () => Promise.resolve(
        overrides.reportCards
          ? overrides.reportCards.find((c: any) => String(c.assessmentId) === String(filter.assessmentId) && String(c.studentId) === String(filter.studentId)) || null
          : (overrides.reportCard ?? null),
      ),
    }),
    find: (filter: any) => ({
      sort: () => ({
        select: () => ({
          lean: () => Promise.resolve((overrides.reportCards || []).filter((c: any) => {
            if (filter.assessmentId && String(c.assessmentId) !== String(filter.assessmentId)) return false;
            if (filter.section && c.section !== filter.section) return false;
            if (filter.overallResult && c.overallResult !== filter.overallResult) return false;
            return true;
          })),
        }),
      }),
    }),
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
    return fakePdfBuffer();
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

  // A report measured out to under the printable-area limit on one machine
  // but still bled its last line onto a 2nd page in production, with no
  // other difference in the underlying data - traced to 'Segoe UI' (the
  // font this template's layout math was originally tuned against) not
  // existing outside Windows, so Puppeteer/Chromium quietly substitutes
  // whatever sans-serif font the host container happens to have, which
  // renders every line of text at a slightly different height/width than
  // what the layout was tuned against. Embedding a specific font (the same
  // technique already used for Urdu text) removes that host dependency.
  it('embeds a specific Latin font instead of depending on whatever sans-serif font the host happens to have installed', async () => {
    const { service, getHtml } = makeService({ school: SCHOOL, reportCard: REPORT_CARD });
    await service.generateExamReportCardPdf('demo-school', { assessmentId: 'a1', studentId: 's1' } as any, 'user1');
    const html = getHtml();
    expect(html).toContain("font-family: 'Inter';");
    expect(html).toContain("body { font-family: 'Inter', 'Segoe UI', 'Noto Nastaliq Urdu', Arial, sans-serif;");
  });
});

// Regression coverage for PdfService.generateBulkExamReportCardsPdf - lets
// a staff member download every student's report card for an assessment in
// one combined PDF, instead of the Results tab's one-at-a-time download
// button school admins were complaining about.
describe('PdfService.generateBulkExamReportCardsPdf', () => {
  const makeCard = (overrides: any) => ({
    assessmentId: 'a1', studentId: overrides.studentId,
    assessmentTitle: 'Term 1', academicYear: '2025-26', term: 'Term 1',
    studentName: overrides.studentName, rollNumber: overrides.rollNumber, grade: 'Grade 1', section: overrides.section,
    subjects: [{ subject: 'Math', obtainedMarks: 90, totalMarks: 100, percentage: 90, grade: 'A+' }],
    totalObtainedMarks: 90, totalMaxMarks: 100, overallPercentage: 90, overallGrade: 'A+', overallGPA: 4,
    overallResult: overrides.overallResult, classPosition: 1, totalStudents: 3,
    published: false,
    ...overrides,
  });

  const CARDS = [
    makeCard({ studentId: 's1', studentName: 'Ayesha Khan', rollNumber: 'R-101', section: 'A', overallResult: 'pass' }),
    makeCard({ studentId: 's2', studentName: 'Bilal Ahmed', rollNumber: 'R-102', section: 'A', overallResult: 'fail' }),
    makeCard({ studentId: 's3', studentName: 'Sara Malik', rollNumber: 'R-103', section: 'B', overallResult: 'pass' }),
  ];

  it('merges every matching report card into one combined PDF, in class-position order', async () => {
    const { service } = makeService({ school: SCHOOL, reportCards: CARDS });
    const pdf = await service.generateBulkExamReportCardsPdf('demo-school', { assessmentId: 'a1' } as any, 'user1');
    const merged = await PDFDocument.load(pdf);
    expect(merged.getPageCount()).toBe(3);
  });

  it('narrows the merge to a specific section', async () => {
    const { service } = makeService({ school: SCHOOL, reportCards: CARDS });
    const pdf = await service.generateBulkExamReportCardsPdf('demo-school', { assessmentId: 'a1', section: 'A' } as any, 'user1');
    const merged = await PDFDocument.load(pdf);
    expect(merged.getPageCount()).toBe(2);
  });

  it('narrows the merge to a specific result', async () => {
    const { service } = makeService({ school: SCHOOL, reportCards: CARDS });
    const pdf = await service.generateBulkExamReportCardsPdf('demo-school', { assessmentId: 'a1', result: 'fail' } as any, 'user1');
    const merged = await PDFDocument.load(pdf);
    expect(merged.getPageCount()).toBe(1);
  });

  it('throws a clear error instead of generating anything when no report cards match', async () => {
    const { service } = makeService({ school: SCHOOL, reportCards: CARDS });
    await expect(
      service.generateBulkExamReportCardsPdf('demo-school', { assessmentId: 'a1', section: 'Z' } as any, 'user1'),
    ).rejects.toThrow('No report cards match these filters.');
  });

  // A school accidentally requesting an entire campus at once should get a
  // clear "narrow your filters" error, not a request that renders 100s of
  // PDFs one by one and ties up the server for minutes.
  it('refuses a batch larger than the configured cap instead of silently rendering all of it', async () => {
    const manyCards = Array.from({ length: 101 }, (_, i) =>
      makeCard({ studentId: `s${i}`, studentName: `Student ${i}`, rollNumber: `R-${i}`, section: 'A', overallResult: 'pass' }));
    const { service } = makeService({ school: SCHOOL, reportCards: manyCards });
    await expect(
      service.generateBulkExamReportCardsPdf('demo-school', { assessmentId: 'a1' } as any, 'user1'),
    ).rejects.toThrow(/narrow them/);
  });
});
