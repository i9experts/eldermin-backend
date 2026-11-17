import { AssessmentService } from './assessment.service';

// Three independent fixes bundled together because they're all small and
// touch the same Results/Analytics area of Assessment Master Settings:
// (1) Analytics' academicYear filter is now optional ("All Years") instead
//     of silently returning nothing the moment the school's Institution
//     Setup "current" year drifts from what's actually stored on an
//     assessment; (2) Unpublish Results / Unpublish Term Report Cards
//     reverse their Publish counterparts by flipping `published` back to
//     false (the Parent Portal already gates on published:true, so nothing
//     else needs to change there - see parent-portal.service.ts).

function makeService(overrides: Record<string, any> = {}) {
  const svc: any = Object.create(AssessmentService.prototype);
  svc.assessmentModel = overrides.assessmentModel;
  svc.markModel = overrides.markModel ?? { find: () => ({ select: () => ({ lean: async () => [] }) }) };
  svc.quizAttemptModel = overrides.quizAttemptModel ?? { find: () => ({ select: () => ({ lean: async () => [] }) }) };
  svc.questionModel = overrides.questionModel ?? { find: () => ({ select: () => ({ lean: async () => [] }) }) };
  svc.reportCardModel = overrides.reportCardModel;
  svc.termReportCardModel = overrides.termReportCardModel;
  svc.studentModel = overrides.studentModel ?? { find: () => ({ select: () => ({ lean: async () => [] }) }) };
  return svc;
}

describe('AssessmentService — getPerformanceAnalytics academicYear filter', () => {
  it('omits academicYear from the assessment filter entirely when not provided ("All Years")', async () => {
    let capturedFilter: any = null;
    const assessmentModel: any = {
      find: (filter: any) => { capturedFilter = filter; return { select: () => ({ lean: async () => [] }) }; },
    };
    const svc = makeService({ assessmentModel });
    await svc.getPerformanceAnalytics('demo-school', {});
    expect(capturedFilter).toEqual({ schoolSlug: 'demo-school' });
    expect(capturedFilter.academicYear).toBeUndefined();
  });

  it('still filters by academicYear when one is explicitly selected', async () => {
    let capturedFilter: any = null;
    const assessmentModel: any = {
      find: (filter: any) => { capturedFilter = filter; return { select: () => ({ lean: async () => [] }) }; },
    };
    const svc = makeService({ assessmentModel });
    await svc.getPerformanceAnalytics('demo-school', { academicYear: '2025-26' });
    expect(capturedFilter).toEqual({ schoolSlug: 'demo-school', academicYear: '2025-26' });
  });

  it('a school with a published assessment under a year that differs from "current" still gets real analytics once "All Years" is used', async () => {
    const assessmentModel: any = {
      find: () => ({ select: () => ({ lean: async () => [{ _id: 'a1', title: 'Term-1-Grade-1-Summative Assessment', type: 'mid_term', term: 'Term 1', startDate: new Date(), grade: 'Grade 1' }] }) }),
    };
    const markModel: any = {
      find: () => ({ select: () => ({ lean: async () => [{ studentId: 's1', studentName: 'Ayesha', grade: 'Grade 1', section: 'A', subject: 'Math', totalMarks: 100, obtainedMarks: 90, isAbsent: false, isExempt: false, result: 'pass', assessmentId: 'a1' }] }) }),
    };
    const svc = makeService({ assessmentModel, markModel });
    const result = await svc.getPerformanceAnalytics('demo-school', {});
    expect(result.meta.totalAssessments).toBe(1);
    expect(result.meta.totalStudentsEvaluated).toBe(1);
  });
});

describe('AssessmentService — unpublishResults', () => {
  it('flips published back to false and clears publishedAt on the matching report cards, and reverts the assessment status', async () => {
    const updateManyArgs: any[] = [];
    const findByIdAndUpdateArgs: any[] = [];
    const reportCardModel: any = { updateMany: async (...args: any[]) => { updateManyArgs.push(args); return {}; } };
    const assessmentModel: any = { findByIdAndUpdate: async (...args: any[]) => { findByIdAndUpdateArgs.push(args); return {}; } };
    const svc = makeService({ reportCardModel, assessmentModel });

    const result = await svc.unpublishResults({ assessmentId: '507f1f77bcf86cd799439011', schoolSlug: 's' });

    expect(updateManyArgs[0][0]).toMatchObject({ schoolSlug: 's' });
    expect(updateManyArgs[0][1]).toMatchObject({ $set: { published: false }, $unset: { publishedAt: '' } });
    expect(findByIdAndUpdateArgs[0][1]).toMatchObject({
      $set: { status: 'completed', resultPublished: false },
      $unset: { resultPublishedAt: '', resultPublishedBy: '' },
    });
    expect(result.message).toMatch(/unpublished/i);
  });
});

describe('AssessmentService — unpublishTermReportCards', () => {
  it('flips published back to false for every term report card matching the academicYear/term/grade/section filter', async () => {
    let capturedFilter: any = null;
    let capturedUpdate: any = null;
    const termReportCardModel: any = {
      updateMany: async (filter: any, update: any) => { capturedFilter = filter; capturedUpdate = update; return { modifiedCount: 3 }; },
    };
    const svc = makeService({ termReportCardModel });

    const result = await svc.unpublishTermReportCards({ schoolSlug: 's', academicYear: '2025-26', term: 'Term 1', grade: 'Grade 1' });

    expect(capturedFilter).toEqual({ schoolSlug: 's', academicYear: '2025-26', term: 'Term 1', grade: 'Grade 1' });
    expect(capturedUpdate).toEqual({ $set: { published: false }, $unset: { publishedAt: '' } });
    expect(result.message).toBe('3 term report card(s) unpublished - no longer visible in the parent app');
  });

  it('leaves grade/section out of the filter when not provided, matching every section for that year/term', async () => {
    let capturedFilter: any = null;
    const termReportCardModel: any = {
      updateMany: async (filter: any) => { capturedFilter = filter; return { modifiedCount: 0 }; },
    };
    const svc = makeService({ termReportCardModel });
    await svc.unpublishTermReportCards({ schoolSlug: 's', academicYear: '2025-26', term: 'Term 1' });
    expect(capturedFilter).toEqual({ schoolSlug: 's', academicYear: '2025-26', term: 'Term 1' });
  });
});

describe('AssessmentService — getReportCards master search + student photo', () => {
  const leanChain = (v: any) => ({ sort: () => ({ skip: () => ({ limit: () => ({ lean: async () => v }) }) }) });

  it('matches by student name or roll number, case-insensitively, when search is provided', async () => {
    let capturedFilter: any = null;
    const reportCardModel: any = {
      find: (filter: any) => { capturedFilter = filter; return leanChain([]); },
      countDocuments: async () => 0,
    };
    const svc = makeService({ reportCardModel });
    await svc.getReportCards('demo-school', { search: 'abdullah', page: 1, limit: 20 } as any);
    expect(capturedFilter.$or).toEqual([
      { studentName: { $regex: 'abdullah', $options: 'i' } },
      { rollNumber: { $regex: 'abdullah', $options: 'i' } },
    ]);
  });

  it('escapes regex special characters in the search term so they are matched literally', async () => {
    let capturedFilter: any = null;
    const reportCardModel: any = {
      find: (filter: any) => { capturedFilter = filter; return leanChain([]); },
      countDocuments: async () => 0,
    };
    const svc = makeService({ reportCardModel });
    await svc.getReportCards('demo-school', { search: 'a.b*c(d)', page: 1, limit: 20 } as any);
    expect(capturedFilter.$or[0].studentName.$regex).toBe('a\\.b\\*c\\(d\\)');
  });

  it('leaves $or out of the filter entirely when no search term is given', async () => {
    let capturedFilter: any = null;
    const reportCardModel: any = {
      find: (filter: any) => { capturedFilter = filter; return leanChain([]); },
      countDocuments: async () => 0,
    };
    const svc = makeService({ reportCardModel });
    await svc.getReportCards('demo-school', { page: 1, limit: 20 } as any);
    expect(capturedFilter.$or).toBeUndefined();
  });

  it('joins each report card with its student photo, so the Results list can show a real profile picture', async () => {
    const reportCardModel: any = {
      find: () => leanChain([
        { _id: 'rc1', studentId: 's1', studentName: 'Ayesha' },
        { _id: 'rc2', studentId: 's2', studentName: 'Bilal' },
      ]),
      countDocuments: async () => 2,
    };
    const studentModel: any = {
      find: () => ({ select: () => ({ lean: async () => [{ _id: 's1', photo: 'https://cdn/ayesha.jpg' }, { _id: 's2', photo: null }] }) }),
    };
    const svc = makeService({ reportCardModel, studentModel });
    const result = await svc.getReportCards('demo-school', { page: 1, limit: 20 } as any);
    expect(result.data[0].studentPhoto).toBe('https://cdn/ayesha.jpg');
    expect(result.data[1].studentPhoto).toBeNull();
  });
});
