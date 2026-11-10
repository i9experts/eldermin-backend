import { PdfService } from './pdf.service';

// Regression coverage for the fix to PdfService.generateReportCard: it
// used to query `assessmentModel` (one whole-exam definition per grade/
// section, with no studentId field at all) and a `behaviourModel.traits`
// field that doesn't exist on that schema - so every real report card
// PDF showed zero marks and no Tarbiyah data, silently, regardless of
// what the student had actually been marked. It now reads the
// already-computed TermReportCard (see AssessmentService.
// generateTermReportCards, Phase 1) directly.

function makeService(overrides: { student?: any; school?: any; termReportCard?: any; visibilitySettings?: any }) {
  const n: any = {};
  const studentModel: any = { findOne: () => ({ lean: () => Promise.resolve(overrides.student) }) };
  const schoolModel: any = { findOne: () => ({ lean: () => Promise.resolve(overrides.school) }) };
  const termReportCardModel: any = {
    findOne: () => ({ sort: () => ({ lean: () => Promise.resolve(overrides.termReportCard ?? null) }) }),
  };
  const visibilitySettingsModel: any = { findOne: () => ({ lean: () => Promise.resolve(overrides.visibilitySettings ?? null) }) };
  // positions: pdfLog,student,invoice,school,assessment,behaviour,reportTemplate,
  // payment,expense,bankAccount,campus,groupInstitution,qaida,tarbiyah,
  // characterSettings,financeService,termReportCard,reportCard,visibilitySettings
  const args = [n, studentModel, n, schoolModel, n, n, n, n, n, n, n, n, n, n, n, n, termReportCardModel, n, visibilitySettingsModel];
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

  it('never routes through the custom template-driven "Result Card" - it cannot represent Tarbiyah/Qaida/attendance and would silently render a near-blank page', async () => {
    const { service, getHtml } = makeService({ student: STUDENT, school: SCHOOL, termReportCard: TERM_REPORT_CARD });
    const renderTemplateDrivenPdf = jest.spyOn(service as any, 'renderTemplateDrivenPdf');
    await service.generateReportCard('demo-school', { studentId: 's1', academicYear: '2025-26' } as any, 'user1');
    expect(renderTemplateDrivenPdf).not.toHaveBeenCalled();
    expect(getHtml()).toContain('Tarbiyah (Character Development)');
  });

  it('renders the comprehensive Tarbiyah/Qaida/Nazra/attendance detail - strengths, recommended actions, recent lessons, invigilator/home-tutoring logs, month-by-month attendance', async () => {
    const comprehensive = {
      ...TERM_REPORT_CARD,
      sectionsIncluded: { ...TERM_REPORT_CARD.sectionsIncluded, qaida: true, nazra: true },
      tarbiyah: {
        ...TERM_REPORT_CARD.tarbiyah,
        areasOfStrength: ['Punctuality'],
        areasForImprovement: ['Sharing with classmates'],
        recommendedActions: ['Encourage group activities at home'],
      },
      qaida: {
        overallStatus: 'in_progress', currentTakhti: 6, totalTakhtis: 16, masteryPct: 81,
        takhtis: [{ number: 6, sabaqLog: [{ date: '2025-09-20', sabaqFrom: '1', sabaqTo: '5', rating: 'excellent', assessedBy: 'Ustadh Ali' }] }],
        commonErrors: [{ error: 'Makhraj of Dhaad', count: 3 }],
      },
      nazra: {
        overallStatus: 'in_progress', currentPara: 2, totalParas: 30, completionPct: 7,
        diaryLog: [{ date: '2025-09-21', assessedBy: 'Ustadh Bilal', sabaq: { paraNumber: 2, pageFrom: '5', pageTo: '8', rating: 'good' } }],
        commonErrors: [],
      },
      qaidaNazraExtras: {
        invigilatorAssessments: [{ visitDate: '2025-09-25', invigilatorName: 'Qari Yusuf', invigilatorType: 'external', overallScore: 4.1, overallRemarks: 'Good tajweed awareness.' }],
        homeLog: [{ date: '2025-09-22', takhtiNumber: 6, pageFrom: '1', pageTo: '3', tutorName: 'Mother', notes: 'Practiced after Maghrib.' }],
      },
      attendance: { ...TERM_REPORT_CARD.attendance, trend: [{ date: '2025-09-02', presentCount: 20, absentCount: 1, total: 21 }] },
    };
    const { service, getHtml } = makeService({ student: STUDENT, school: SCHOOL, termReportCard: comprehensive });
    await service.generateReportCard('demo-school', { studentId: 's1', academicYear: '2025-26' } as any, 'user1');
    const html = getHtml();
    expect(html).toContain('Areas of Strength');
    expect(html).toContain('Punctuality');
    expect(html).toContain('Recommended Actions');
    expect(html).toContain('Encourage group activities at home');
    expect(html).toContain('Qaida — Recent Lessons');
    expect(html).toContain('Makhraj of Dhaad (3)');
    expect(html).toContain('Nazra — Recent Diary');
    expect(html).toContain('Invigilator Assessments');
    expect(html).toContain('Qari Yusuf');
    expect(html).toContain('Parent Home-Tutoring Log');
    expect(html).toContain('Practiced after Maghrib.');
    expect(html).toContain('Month-by-Month');
    expect(html).toContain('September 2025');
  });

  it('wraps Urdu/Arabic free text in dir="rtl" and embeds the Noto Nastaliq Urdu font, so letters shape and join correctly instead of rendering as disconnected isolated glyphs in whatever font the container happens to have', async () => {
    const urdu = {
      ...TERM_REPORT_CARD,
      sectionsIncluded: { ...TERM_REPORT_CARD.sectionsIncluded, qaida: true },
      tarbiyah: { ...TERM_REPORT_CARD.tarbiyah, teacherObservations: 'بہتر ہے مزید محنت کی ضرورت ہے۔' },
      qaidaNazraExtras: {
        invigilatorAssessments: [{ visitDate: '2025-09-25', invigilatorName: 'مولانا مسعود صاحب', invigilatorType: 'external', overallScore: 3.4, overallRemarks: 'بہتر ہے مزید محنت کی ضرورت ہے۔' }],
        homeLog: [],
      },
      teacherFeedback: [{ source: 'tarbiyah', text: 'بہتر ہے مزید محنت کی ضرورت ہے۔', author: 'مولانا مسعود صاحب', date: '2025-09-25' }],
      classTeacherRemarks: 'ماشاءاللہ بہت اچھا۔',
    };
    const { service, getHtml } = makeService({ student: STUDENT, school: SCHOOL, termReportCard: urdu });
    await service.generateReportCard('demo-school', { studentId: 's1', academicYear: '2025-26' } as any, 'user1');
    const html = getHtml();
    expect(html).toContain(`@font-face`);
    expect(html).toContain(`'Noto Nastaliq Urdu'`);
    expect(html).toContain(`<span dir="rtl">مولانا مسعود صاحب</span>`);
    expect(html).toContain(`<span dir="rtl">بہتر ہے مزید محنت کی ضرورت ہے۔</span>`);
    expect(html).toContain(`<div class="remarks-text"><span dir="rtl">ماشاءاللہ بہت اچھا۔</span></div>`);
  });

  it('shows the school\'s custom Pass/Fail wording from Assessment Master Settings instead of the literal word', async () => {
    const { service, getHtml } = makeService({
      student: STUDENT, school: SCHOOL,
      termReportCard: { ...TERM_REPORT_CARD, overallResult: 'fail' },
      visibilitySettings: { passLabel: 'Promoted', failLabel: 'Needs Improvement' },
    });
    await service.generateReportCard('demo-school', { studentId: 's1', academicYear: '2025-26' } as any, 'user1');
    const html = getHtml();
    expect(html).toContain('Needs Improvement');
    expect(html).not.toContain('>FAIL<');
  });

  it('falls back to the plain "Pass"/"Fail" words when no custom labels are configured', async () => {
    const { service, getHtml } = makeService({ student: STUDENT, school: SCHOOL, termReportCard: TERM_REPORT_CARD, visibilitySettings: null });
    await service.generateReportCard('demo-school', { studentId: 's1', academicYear: '2025-26' } as any, 'user1');
    expect(getHtml()).toContain('Pass');
  });
});
