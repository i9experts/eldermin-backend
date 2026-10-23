import { Types } from 'mongoose';
import { ParentEngagementService, PARENT_ENGAGEMENT_WEIGHTS } from './parent-engagement.service';

function chain(result: any) {
  const obj: any = {};
  ['select', 'sort', 'limit', 'skip'].forEach((m) => { obj[m] = () => obj; });
  obj.lean = () => Promise.resolve(result);
  return obj;
}

function makeModel(findResult: any = [], findOneResult: any = null) {
  return {
    find: jest.fn(() => chain(findResult)),
    findOne: jest.fn(() => chain(findOneResult)),
    findOneAndUpdate: jest.fn(() => chain(findOneResult)),
    countDocuments: jest.fn(() => Promise.resolve(Array.isArray(findResult) ? findResult.length : 0)),
  };
}

const studentId = new Types.ObjectId();
const invoiceId = new Types.ObjectId();
const circularId = new Types.ObjectId();
const parentUserId = new Types.ObjectId();
const studentDoc = {
  _id: studentId, firstName: 'Ayesha', lastName: 'Khan',
  currentGrade: '5', currentSection: 'A', campusId: null,
};

/**
 * Builds a fully-wired ParentEngagementService with every dimension
 * returning a clean, known sub-score, so the weighted-combination math
 * can be verified precisely rather than approximately.
 *
 * - feeLateDays: 0 -> fee score 100; 10 -> fee score 50 (100 - 10*5)
 * - pickupLogs: [] -> pickup dimension returns null (no data)
 * - homeTasks: [] -> tarbiyahAtHome dimension returns null (no data)
 * - hygieneChecks: [] -> hygieneCompliance dimension returns null (no data)
 */
function buildService(opts: {
  feeLateDays?: number; pickupLogs?: any[]; homeTasks?: any[]; hygieneChecks?: any[];
} = {}) {
  const feeLateDays = opts.feeLateDays ?? 0;
  const dueDate = new Date('2025-01-10T00:00:00Z');
  const paymentDate = new Date(dueDate.getTime() + feeLateDays * 24 * 60 * 60 * 1000);

  const pickupModel = makeModel(opts.pickupLogs ?? []) as any;
  const studentModel = makeModel([], studentDoc) as any;
  const attendanceModel = makeModel([{ status: 'present', date: new Date('2025-01-05') }]) as any;
  const leaveModel = makeModel([]) as any;
  const invoiceModel = makeModel([{ _id: invoiceId, dueDate, status: 'paid', balanceDue: 0 }]) as any;
  const paymentModel = makeModel([{ invoiceId, paymentDate }]) as any;
  const circularModel = makeModel([{ _id: circularId, audience: { scope: 'school', roles: ['parent'] } }]) as any;
  const ackModel = makeModel([{ circularId }]) as any;
  const userModel = makeModel([{ _id: parentUserId, lastLoginAt: new Date() }]) as any;
  const homeTaskModel = makeModel(opts.homeTasks ?? [{ status: 'completed', reviewRating: 5 }]) as any;
  const hygieneModel = makeModel(opts.hygieneChecks ?? [{
    items: { uniform: true, capOrScarf: true, shoes: true, lunchBrought: true },
  }]) as any;

  const service = new ParentEngagementService(
    pickupModel, studentModel, attendanceModel, leaveModel,
    invoiceModel, paymentModel, circularModel, ackModel, userModel,
    homeTaskModel, hygieneModel,
  );
  return service;
}

describe('ParentEngagementService — scoring engine', () => {
  it('weights sum to exactly 1.0 (no silently-dropped allocation)', () => {
    const total = Object.values(PARENT_ENGAGEMENT_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1.0, 10);
  });

  it('a parent with full, clean data in every dimension scores 100 / excellent', async () => {
    const service = buildService({
      feeLateDays: 0,
      pickupLogs: [{ markedLate: false }, { markedLate: false }],
      homeTasks: [{ status: 'completed', reviewRating: 5 }],
      hygieneChecks: [{ items: { uniform: true, capOrScarf: true, shoes: true, lunchBrought: true } }],
    });
    const result = await service.computeScore('demo-school', String(studentId));

    expect(result.dimensions.every((d) => d.score === 100)).toBe(true);
    expect(result.overallScore).toBe(100);
    expect(result.rating).toBe('excellent');
  });

  it('a dimension with zero data (pickup) is excluded and its weight is redistributed proportionally, not dropped', async () => {
    // Fee dimension scores 50 (10 days late); every other present dimension scores 100;
    // pickup has zero logs -> null -> excluded from the weighted average entirely.
    const service = buildService({ feeLateDays: 10, pickupLogs: [] });
    const result = await service.computeScore('demo-school', String(studentId));

    const pickup = result.dimensions.find((d) => d.key === 'pickupTimeliness');
    expect(pickup?.score).toBeNull();

    const presentKeys = ['feePunctuality', 'circularResponse', 'leaveBehavior', 'appEngagement', 'tarbiyahAtHome', 'hygieneCompliance'] as const;
    const presentWeight = presentKeys.reduce((sum, k) => sum + PARENT_ENGAGEMENT_WEIGHTS[k], 0);
    const expectedWeighted = (
      50 * PARENT_ENGAGEMENT_WEIGHTS.feePunctuality
      + 100 * PARENT_ENGAGEMENT_WEIGHTS.circularResponse
      + 100 * PARENT_ENGAGEMENT_WEIGHTS.leaveBehavior
      + 100 * PARENT_ENGAGEMENT_WEIGHTS.appEngagement
      + 100 * PARENT_ENGAGEMENT_WEIGHTS.tarbiyahAtHome
      + 100 * PARENT_ENGAGEMENT_WEIGHTS.hygieneCompliance
    ) / presentWeight;

    expect(result.overallScore).toBeCloseTo(expectedWeighted, 1);
    // Proves redistribution actually happened: dividing by the full 1.0
    // weight instead of the present-only weight would land in a different
    // (lower) rating band for this exact input.
    const naiveOverall = (
      50 * PARENT_ENGAGEMENT_WEIGHTS.feePunctuality
      + 100 * PARENT_ENGAGEMENT_WEIGHTS.circularResponse
      + 100 * PARENT_ENGAGEMENT_WEIGHTS.leaveBehavior
      + 100 * PARENT_ENGAGEMENT_WEIGHTS.appEngagement
      + 100 * PARENT_ENGAGEMENT_WEIGHTS.tarbiyahAtHome
      + 100 * PARENT_ENGAGEMENT_WEIGHTS.hygieneCompliance
    ) / 1.0;
    expect(result.overallScore).toBeGreaterThan(naiveOverall);
  });

  it('multiple simultaneous missing dimensions (pickup, tarbiyah-at-home, hygiene) still redistribute correctly', async () => {
    const service = buildService({ pickupLogs: [], homeTasks: [], hygieneChecks: [] });
    const result = await service.computeScore('demo-school', String(studentId));

    const missing = ['pickupTimeliness', 'tarbiyahAtHome', 'hygieneCompliance'];
    for (const key of missing) {
      expect(result.dimensions.find((d) => d.key === key)?.score).toBeNull();
    }
    // Every present dimension scores 100 in this fixture, so even after
    // redistributing the three missing dimensions' weight, the overall
    // should still land at exactly 100 (weighted average of all-100s is 100
    // regardless of which weights are in play) — a strong sanity check that
    // redistribution doesn't corrupt the math when every surviving input
    // is clean.
    expect(result.overallScore).toBe(100);
    expect(result.rating).toBe('excellent');
  });

  it('Tarbiyah-at-home: a parent-completed task with NO teacher review still counts in full, never penalized for missing review', async () => {
    const service = buildService({ homeTasks: [{ status: 'completed' }, { status: 'completed' }] });
    const result = await service.computeScore('demo-school', String(studentId));
    const dim = result.dimensions.find((d) => d.key === 'tarbiyahAtHome');
    expect(dim?.score).toBe(100);
  });

  it('Tarbiyah-at-home: an assigned-but-not-completed task drags the completion rate down', async () => {
    const service = buildService({ homeTasks: [{ status: 'completed' }, { status: 'assigned' }] });
    const result = await service.computeScore('demo-school', String(studentId));
    const dim = result.dimensions.find((d) => d.key === 'tarbiyahAtHome');
    expect(dim?.score).toBe(50);
  });

  it('Hygiene: a non-compliant item lowers the compliance rate proportionally across all checked items', async () => {
    const service = buildService({
      hygieneChecks: [{ items: { uniform: false, capOrScarf: true, shoes: true, lunchBrought: true } }],
    });
    const result = await service.computeScore('demo-school', String(studentId));
    const dim = result.dimensions.find((d) => d.key === 'hygieneCompliance');
    expect(dim?.score).toBe(75); // 3 of 4 items compliant
  });

  it('a student with no data in ANY dimension gets insufficient_data, not a misleading 0 or 100', async () => {
    const pickupModel = makeModel([]) as any;
    const studentModel = makeModel([], studentDoc) as any;
    const attendanceModel = makeModel([]) as any;
    const leaveModel = makeModel([]) as any;
    const invoiceModel = makeModel([]) as any;
    const paymentModel = makeModel([]) as any;
    const circularModel = makeModel([]) as any;
    const ackModel = makeModel([]) as any;
    const userModel = makeModel([]) as any;
    const homeTaskModel = makeModel([]) as any;
    const hygieneModel = makeModel([]) as any;
    const service = new ParentEngagementService(
      pickupModel, studentModel, attendanceModel, leaveModel,
      invoiceModel, paymentModel, circularModel, ackModel, userModel,
      homeTaskModel, hygieneModel,
    );

    const result = await service.computeScore('demo-school', String(studentId));
    expect(result.overallScore).toBeNull();
    expect(result.rating).toBe('insufficient_data');
    expect(result.dimensions.every((d) => d.score === null)).toBe(true);
  });
});
