import { AssessmentService } from './assessment.service';

// The Assessment Dashboard's "Grade-wise Performance Summary" used to pull
// from MarkEntry alone with no reference to the parent assessment's status -
// a teacher can enter marks as soon as an assessment is "ongoing", well
// before it's marked completed/result_published, so those partial/unverified
// entries counted toward the dashboard's official pass/fail numbers while the
// same assessment still sat as a draft/not-yet-generated entry in the
// Planner. getDashboard now joins back to the assessment and only includes
// marks whose assessment has actually finished (completed or
// result_published).

function makeService(overrides: Record<string, any> = {}) {
  const svc: any = Object.create(AssessmentService.prototype);
  const emptyArr = () => Promise.resolve([]);
  svc.assessmentModel = overrides.assessmentModel ?? {
    countDocuments: () => Promise.resolve(0),
    aggregate: () => Promise.resolve([]),
    find: () => ({ sort: () => ({ limit: () => ({ select: emptyArr }) }) }),
  };
  svc.questionModel = overrides.questionModel ?? { countDocuments: () => Promise.resolve(0) };
  svc.markModel = overrides.markModel;
  return svc;
}

describe('AssessmentService.getDashboard — Grade-wise Performance Summary', () => {
  it('sends an aggregation pipeline that joins to assessments and only counts completed/result_published ones', async () => {
    let capturedPipeline: any[] = [];
    const assessmentModel: any = {
      countDocuments: () => Promise.resolve(0),
      aggregate: () => Promise.resolve([]),
      find: () => ({ sort: () => ({ limit: () => ({ select: () => Promise.resolve([]) }) }) }),
    };
    const markModel: any = {
      countDocuments: () => Promise.resolve(0),
      aggregate: (pipeline: any[]) => { capturedPipeline = pipeline; return Promise.resolve([]); },
    };
    const svc = makeService({ assessmentModel, markModel });

    await svc.getDashboard('demo-school');

    const lookupStage = capturedPipeline.find(s => s.$lookup);
    expect(lookupStage).toEqual({
      $lookup: { from: 'assessments', localField: 'assessmentId', foreignField: '_id', as: 'assessment' },
    });
    expect(capturedPipeline).toEqual(expect.arrayContaining([
      { $unwind: '$assessment' },
      { $match: { 'assessment.status': { $in: ['completed', 'result_published'] } } },
    ]));
    // The lookup/finalized-status filter must run before the $group, or it
    // has no effect on the counted marks.
    const lookupIndex = capturedPipeline.indexOf(lookupStage);
    const groupIndex = capturedPipeline.findIndex(s => s.$group);
    expect(lookupIndex).toBeGreaterThanOrEqual(0);
    expect(groupIndex).toBeGreaterThan(lookupIndex);
  });

  it('still scopes by schoolSlug and academicYear, and excludes null/absent marks, ahead of the finalized-status join', async () => {
    let capturedPipeline: any[] = [];
    const assessmentModel: any = {
      countDocuments: () => Promise.resolve(0),
      aggregate: () => Promise.resolve([]),
      find: () => ({ sort: () => ({ limit: () => ({ select: () => Promise.resolve([]) }) }) }),
    };
    const markModel: any = {
      countDocuments: () => Promise.resolve(0),
      aggregate: (pipeline: any[]) => { capturedPipeline = pipeline; return Promise.resolve([]); },
    };
    const svc = makeService({ assessmentModel, markModel });

    await svc.getDashboard('demo-school', '2026-27');

    expect(capturedPipeline[0]).toEqual({
      $match: { schoolSlug: 'demo-school', academicYear: '2026-27', obtainedMarks: { $ne: null }, isAbsent: false },
    });
  });
});
