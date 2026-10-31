import { PdfService } from './pdf.service';

// Regression coverage for the fix to PdfService.generateReportCard: it
// used to query `assessmentModel` (one whole-exam definition per grade/
// section, with no studentId field at all) and a `behaviourModel.traits`
// field that doesn't exist on that schema - so every real report card
// PDF showed zero marks and no Tarbiyah data, silently, regardless of
// what the student had actually been marked. It now reads the
// already-computed TermReportCard (see AssessmentService.
// generateTermReportCards, Phase 1) directly.

function makeService(overrides: { student?: any; school?: any; termReportCard?: any }) {
  const n: any = {};
  const studentModel: any = { findOne: () => ({ lean: () => Promise.resolve(overrides.student) }) };
  const schoolModel: any = { findOne: () => ({ lean: () => Promise.resolve(overrides.school) }) };
  const termReportCardModel: any = {
    findOne: () => ({ sort: () => ({ lean: () => Promise.resolve(overrides.termReportCard ?? null) }) }),
  };
  // positions: pdfLog,student,invoice,school,assessment,behaviour,reportTemplate,
  // payment,expense,bankAccount,campus,groupInstitution,qaida,tarbiyah,
  // characterSettings,financeService,termReportCard
  const args = [n, studentModel, n, schoolModel, n, n, n, n, n, n, n, n, n, n, n, n, termReportCardModel];
  const PdfServiceAny: any = PdfService;
  const service = new PdfServiceAny(...args) as PdfService;
  let capturedHtml = '';
  jest.spyOn(service as any, 'renderTemplateDrivenPdf').mockRejectedValue(new Error('no custom template configured'));
  jest.spyOn(service as any, 'htmlToPdf').mockImplementation(async (html: any) => {
    capturedHtml = html;
    return Buffer.from('fake-pdf');
  });
  jest.spyOn(service as any, 'logPdf').mockResolvedValue(undefined);
  return { service, getHtml: () => capturedHtml };
}

const SCHOOL = { name: 'The Deenway School', address: { street: '12 Main Road', city: 'Karachi' } };
const STUDENT = { _id: 's1', firstName: 'Ayesha', lastName: 'Khan' };

const TERM_REPORT_CARD = {
  academicYear: '2025-26', term: 'Term 1',
  studentName: 'Ayesha Khan', rollNumber: 'R-101', grade: 'Grade 3', section: 'A',
  subjects: [
    { subject: 'Math', obtainedMarks: 85, totalMarks: 100, percentage: 85, grade: 'A' },
    { subject: 'Science', obtainedMarks: 60, totalMarks: 100, percentage: 60, grade: 'B' },
  ],
  totalObtainedMarks: 145, totalMaxMarks: 200, overallPercentage: 72.5, overallGrade: 'B', overallGPA: 3.3,
  overallResult: 'pass', classPosition: 2, totalStudents: 30,
  strongestSubject: 'Math', weakestSubject: 'Science',
  sectionsIncluded: { tarbiyah: true, qaida: false, nazra: false, attendance: true, teacherFeedback: true, parentEngagement: true },
  tarbiyah: { overallScore: 4.2, overallPercentage: 84, overallRating: 'good', traits: [{ traitKey: 'sidq', score: 4 }], teacherObservations: 'Honest and reliable.' },
  attendance: { attendanceRate: 94, presentCount: 80, lateCount: 2, absentCount: 3, halfDayCount: 0, markedDays: 85 },
  parentEngagement: { overallScore: 76, rating: 'good', recommendation: 'Keep up the regular pickup timeliness.' },
  teacherFeedback: [{ source: 'subject_remark', subject: 'Math', text: 'Excellent problem solving', author: 'Ms. Fatima', date: '2025-10-01' }],
  classTeacherRemarks: 'A hardworking student.',
};

describe('PdfService.generateReportCard', () => {
  it('renders real subject marks and totals from the TermReportCard instead of zero marks', async () => {
    const { service, getHtml } = makeService({ student: STUDENT, school: SCHOOL, termReportCard: TERM_REPORT_CARD });
    await service.generateReportCard('demo-school', { studentId: 's1', academicYear: '2025-26', term: 'Term 1' } as any, 'user1');
    const html = getHtml();
    expect(html).toContain('Math');
    expect(html).toContain('85%');
    expect(html).toContain('145'); // totalObtained
    expect(html).toContain('72.5%'); // overallPct
    expect(html).not.toContain('>0</div><div class="summary-label">Total Obtained');
  });

  it('includes the term-wide class position, not a single-exam one', async () => {
    const { service, getHtml } = makeService({ student: STUDENT, school: SCHOOL, termReportCard: TERM_REPORT_CARD });
    await service.generateReportCard('demo-school', { studentId: 's1', academicYear: '2025-26' } as any, 'user1');
    expect(getHtml()).toContain('#2 of 30');
  });

  it('renders each optional section only when sectionsIncluded flags it', async () => {
    const { service, getHtml } = makeService({ student: STUDENT, school: SCHOOL, termReportCard: TERM_REPORT_CARD });
    await service.generateReportCard('demo-school', { studentId: 's1', academicYear: '2025-26' } as any, 'user1');
    const html = getHtml();
    expect(html).toContain('Tarbiyah (Character Development)');
    expect(html).toContain('Truthfulness (Sidq)');
    expect(html).toContain('Attendance');
    expect(html).toContain('Parent Engagement');
    expect(html).toContain('Teacher Feedback This Term');
    expect(html).toContain('Excellent problem solving');
    expect(html).not.toContain('Qaida / Nazra Progress');
  });

  it('shows a plain "not available" message when a section was requested but has no data, instead of a blank gap', async () => {
    const noTarbiyah = { ...TERM_REPORT_CARD, tarbiyah: null };
    const { service, getHtml } = makeService({ student: STUDENT, school: SCHOOL, termReportCard: noTarbiyah });
    await service.generateReportCard('demo-school', { studentId: 's1', academicYear: '2025-26' } as any, 'user1');
    expect(getHtml()).toContain('No Tarbiyah assessment on file for this academic year.');
  });

  it('throws a clear, actionable error when no term report card has been generated yet', async () => {
    const { service } = makeService({ student: STUDENT, school: SCHOOL, termReportCard: null });
    await expect(service.generateReportCard('demo-school', { studentId: 's1', academicYear: '2025-26' } as any, 'user1'))
      .rejects.toThrow(/generate one first/i);
  });

  it('throws when the student does not exist', async () => {
    const { service } = makeService({ student: null, school: SCHOOL });
    await expect(service.generateReportCard('demo-school', { studentId: 'missing', academicYear: '2025-26' } as any, 'user1'))
      .rejects.toThrow('Student not found');
  });

  it('escapes free-text fields to prevent HTML injection from teacher remarks/feedback', async () => {
    const malicious = { ...TERM_REPORT_CARD, classTeacherRemarks: '<script>alert(1)</script>' };
    const { service, getHtml } = makeService({ student: STUDENT, school: SCHOOL, termReportCard: malicious });
    await service.generateReportCard('demo-school', { studentId: 's1', academicYear: '2025-26' } as any, 'user1');
    expect(getHtml()).not.toContain('<script>alert(1)</script>');
    expect(getHtml()).toContain('&lt;script&gt;');
  });
});
