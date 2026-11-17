import { GamificationService } from './gamification.service';

const SCHOOL_SLUG = 'demo-school';
const STUDENT_ID = '507f1f77bcf86cd799439011';

function build(opts: { existingTotal?: any } = {}) {
  const createdTx: any[] = [];
  const createdBadges: any[] = [];
  let total = opts.existingTotal ?? { totalPoints: 0 };

  function TxModel() {}
  (TxModel as any).create = jest.fn(async (doc: any) => {
    createdTx.push(doc);
    return { _id: 'tx' + createdTx.length, ...doc };
  });

  function TotalModel() {}
  (TotalModel as any).findOneAndUpdate = jest.fn(async (_filter: any, update: any) => {
    const inc = update.$inc?.totalPoints || 0;
    total = { ...total, ...update.$set, totalPoints: (total.totalPoints || 0) + inc };
    return total;
  });
  (TotalModel as any).findOne = jest.fn(() => ({ lean: async () => total }));
  (TotalModel as any).find = jest.fn(() => ({
    sort: () => ({ limit: () => ({ lean: async () => [total].filter((t) => t && t.totalPoints !== undefined) }) }),
  }));

  function BadgeModel() {}
  (BadgeModel as any).create = jest.fn(async (doc: any) => {
    if (createdBadges.some((b) => b.studentId === doc.studentId && b.badgeKey === doc.badgeKey)) {
      const err: any = new Error('duplicate');
      err.code = 11000;
      throw err;
    }
    createdBadges.push(doc);
    return { _id: 'badge' + createdBadges.length, ...doc };
  });
  (BadgeModel as any).find = jest.fn(() => ({ sort: () => ({ lean: async () => createdBadges }) }));

  function StudentModel() {}
  (StudentModel as any).findOne = jest.fn(() => ({
    select: () => ({ lean: async () => ({ firstName: 'A', lastName: 'B', currentGrade: '5', currentSection: 'A' }) }),
  }));

  const svc: any = Object.create(GamificationService.prototype);
  svc.txModel = TxModel;
  svc.totalModel = TotalModel;
  svc.badgeModel = BadgeModel;
  svc.studentModel = StudentModel;
  return { svc: svc as GamificationService, createdTx, createdBadges, getTotal: () => total };
}

describe('GamificationService (LMS Phase 5)', () => {
  it('awardPoints creates a transaction and increments the cached total', async () => {
    const { svc, getTotal } = build();
    const tx = await svc.awardPoints(SCHOOL_SLUG, STUDENT_ID, 10, 'Completed lesson', 'lesson_completion', 'src1');
    expect(tx).not.toBeNull();
    expect(getTotal().totalPoints).toBe(10);
  });

  it('awardPoints returns null (not throws) on a duplicate (studentId, sourceType, sourceId)', async () => {
    const { svc } = build();
    (svc as any).txModel.create = jest.fn(async () => {
      const err: any = new Error('dup');
      err.code = 11000;
      throw err;
    });
    const tx = await svc.awardPoints(SCHOOL_SLUG, STUDENT_ID, 10, 'reason', 'lesson_completion', 'src1');
    expect(tx).toBeNull();
  });

  it('awardBadge is a no-op returning null for an unknown badge key', async () => {
    const { svc, createdBadges } = build();
    const badge = await svc.awardBadge(SCHOOL_SLUG, STUDENT_ID, 'not_a_real_badge');
    expect(badge).toBeNull();
    expect(createdBadges).toHaveLength(0);
  });

  it('awardBadge returns null (not throws) when the student already has this badge', async () => {
    const { svc } = build();
    const first = await svc.awardBadge(SCHOOL_SLUG, STUDENT_ID, 'first_lesson');
    const second = await svc.awardBadge(SCHOOL_SLUG, STUDENT_ID, 'first_lesson');
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it('awardPoints auto-awards the points_100 milestone badge once the running total crosses 100', async () => {
    const { svc, createdBadges } = build({ existingTotal: { totalPoints: 95 } });
    await svc.awardPoints(SCHOOL_SLUG, STUDENT_ID, 10, 'reason', 'quiz_attempt', 'src1');
    expect(createdBadges.some((b) => b.badgeKey === 'points_100')).toBe(true);
  });

  it('manualAward always creates a fresh transaction, never deduped against a prior manual award', async () => {
    const { svc, createdTx } = build();
    await svc.manualAward(SCHOOL_SLUG, STUDENT_ID, 20, 'Bonus', 'Teacher A');
    await svc.manualAward(SCHOOL_SLUG, STUDENT_ID, 20, 'Bonus', 'Teacher A');
    expect(createdTx).toHaveLength(2);
  });

  it('getStudentSummary returns totalPoints and the catalog-enriched badge list', async () => {
    const { svc } = build({ existingTotal: { totalPoints: 42 } });
    await svc.awardBadge(SCHOOL_SLUG, STUDENT_ID, 'first_lesson');
    const summary = await svc.getStudentSummary(SCHOOL_SLUG, STUDENT_ID);
    expect(summary.totalPoints).toBe(42);
    expect(summary.badges[0]).toMatchObject({ key: 'first_lesson', label: 'First Step' });
  });

  it('getLeaderboard ranks rows by totalPoints descending', async () => {
    const { svc } = build({ existingTotal: { totalPoints: 42, studentId: STUDENT_ID, studentName: 'A B', currentGrade: '5', currentSection: 'A' } });
    const board = await svc.getLeaderboard(SCHOOL_SLUG, {});
    expect(board[0]).toMatchObject({ rank: 1, totalPoints: 42 });
  });
});
