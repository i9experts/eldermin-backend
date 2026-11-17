import { QaidaService } from './qaida.service';
import { QAIDA_TAKHTIS, QAIDA_TAKHTI_COUNT } from './schemas/qaida-progress.schema';

// Pins the Qaida-specific additions: out-of-order recording is now allowed
// (unlike Nazra), 'not_tracked' boards are excluded from the mastery%/
// pointer math, and a 'joined_later' init seeds the right starting board.

function makeProgress(overrides: Partial<any> = {}) {
  return {
    studentId: '507f1f77bcf86cd799439011',
    studentName: 'Test Student',
    grade: 'Grade 3',
    section: 'A',
    takhtis: QAIDA_TAKHTIS.map((t, i) => ({
      takhtiNumber: t.number,
      status: i === 0 ? 'in_progress' : 'not_started',
      startedDate: i === 0 ? new Date() : undefined,
      revisionCount: 0,
      attempts: [],
    })),
    currentTakhti: 1,
    overallStatus: 'in_progress',
    recordType: 'full_history',
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeService(progress: any, upsertSpy?: jest.Mock) {
  const progressModel: any = {
    findOne: jest.fn().mockReturnValue(Promise.resolve(progress)),
    updateOne: upsertSpy || jest.fn().mockResolvedValue(undefined),
  };
  const studentModel: any = {};
  return new QaidaService(progressModel, studentModel);
}

describe('QaidaService.recordAttempt', () => {
  it('allows recording a Takhti far out of sequence (no forward-only check)', async () => {
    const progress = makeProgress();
    const service = makeService(progress);
    const result = await service.recordAttempt(
      '507f1f77bcf86cd799439011', 'demo-school',
      { takhtiNumber: 12, rating: 'proficient' } as any,
      'Teacher',
    );
    const record = result.takhtis.find((t: any) => t.takhtiNumber === 12);
    expect(record?.status).toBe('mastered');
  });

  it('skips not_tracked boards when recomputing the current-takhti pointer', async () => {
    const progress = makeProgress({
      takhtis: QAIDA_TAKHTIS.map((t) => ({
        takhtiNumber: t.number,
        status: t.number <= 5 ? 'not_tracked' : t.number === 6 ? 'in_progress' : 'not_started',
        revisionCount: 0,
        attempts: [],
      })),
    });
    const service = makeService(progress);
    const result = await service.recordAttempt(
      '507f1f77bcf86cd799439011', 'demo-school',
      { takhtiNumber: 6, rating: 'proficient' } as any,
      'Teacher',
    );
    expect(result.currentTakhti).toBe(7);
  });
});

describe('QaidaService.getOrInitProgress', () => {
  it('seeds a joined-later student with earlier boards not_tracked and the placement board in_progress', async () => {
    const upsertSpy = jest.fn().mockResolvedValue(undefined);
    const progress = makeProgress();
    const service = makeService(progress, upsertSpy);
    await service.getOrInitProgress('507f1f77bcf86cd799439011', 'demo-school', '2025-26', {
      studentName: 'Late Joiner', grade: 'Grade 5', recordType: 'joined_later', startAtTakhti: 9,
      priorRecordNote: 'Transferred, no written record',
    } as any);

    const setOnInsert = upsertSpy.mock.calls[0][1].$setOnInsert;
    expect(setOnInsert.recordType).toBe('joined_later');
    expect(setOnInsert.currentTakhti).toBe(9);
    expect(setOnInsert.takhtis.filter((t: any) => t.status === 'not_tracked')).toHaveLength(8);
    expect(setOnInsert.takhtis.find((t: any) => t.takhtiNumber === 9).status).toBe('in_progress');
    expect(setOnInsert.takhtis.find((t: any) => t.takhtiNumber === 10).status).toBe('not_started');
  });

  it('does not seed a custom takhtis array for a normal (full_history) init', async () => {
    const upsertSpy = jest.fn().mockResolvedValue(undefined);
    const progress = makeProgress();
    const service = makeService(progress, upsertSpy);
    await service.getOrInitProgress('507f1f77bcf86cd799439011', 'demo-school', '2025-26', {
      studentName: 'Normal Student', grade: 'Grade 1',
    } as any);

    const setOnInsert = upsertSpy.mock.calls[0][1].$setOnInsert;
    expect(setOnInsert.takhtis).toBeUndefined();
    expect(setOnInsert.recordType).toBeUndefined();
  });
});

describe('QaidaService.getClassProgress mastery math', () => {
  it('excludes not_tracked boards from the masteryPct denominator', async () => {
    const progress = {
      studentId: '507f1f77bcf86cd799439011',
      takhtis: QAIDA_TAKHTIS.map((t) => ({
        takhtiNumber: t.number,
        status: t.number <= 6 ? 'not_tracked' : t.number <= 8 ? 'mastered' : 'not_started',
      })),
      currentTakhti: 9, overallStatus: 'in_progress', recordType: 'joined_later',
    };
    const progressModel: any = {
      find: jest.fn().mockReturnValue({ lean: () => Promise.resolve([progress]) }),
    };
    const studentModel: any = {
      find: jest.fn().mockReturnValue({
        select: () => ({ sort: () => ({ lean: () => Promise.resolve([{ _id: progress.studentId, firstName: 'A', currentGrade: 'Grade 5', currentSection: 'A' }]) }) }),
      }),
    };
    const service = new QaidaService(progressModel, studentModel);
    const rows = await service.getClassProgress('demo-school', 'Grade 5', 'A');
    expect(rows[0].trackedTakhtis).toBe(QAIDA_TAKHTI_COUNT - 6);
    expect(rows[0].masteryPct).toBe(Math.round((2 / (QAIDA_TAKHTI_COUNT - 6)) * 100));
  });
});
