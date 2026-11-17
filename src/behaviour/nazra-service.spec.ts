import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NazraService } from './nazra.service';
import { NAZRA_PARAS, NAZRA_PARA_COUNT } from './schemas/nazra-progress.schema';

// Pins the Nazra daily-diary recording logic: sequential Para progression,
// auto-advance/needs_revision on Sabaq, and weak Sabqi/Manzil reopening an
// already-completed Para - mirroring the proven Qaida coverage.

function makeProgress(overrides: Partial<any> = {}) {
  return {
    studentId: '507f1f77bcf86cd799439011',
    studentName: 'Test Student',
    grade: 'Grade 3',
    section: 'A',
    paras: NAZRA_PARAS.map((p, i) => ({
      paraNumber: p.number,
      status: i === 0 ? 'in_progress' : 'not_started',
      startedDate: i === 0 ? new Date() : undefined,
      revisionCount: 0,
      attempts: [],
    })),
    currentPara: 1,
    overallStatus: 'in_progress',
    diaryEntries: [] as any[],
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeService(progress: any, reverseOrder = false) {
  const progressModel: any = {
    findOne: jest.fn().mockReturnValue(Promise.resolve(progress)),
    updateOne: jest.fn().mockResolvedValue(undefined),
  };
  const studentModel: any = {};
  // Standard (non-reverse) Mushaf order by default - see
  // qaida-nazra-extras.schema.ts's QaidaNazraSettings.nazraReverseOrder.
  const settingsModel: any = {
    findOne: jest.fn().mockReturnValue({ select: () => ({ lean: () => Promise.resolve(reverseOrder ? { nazraReverseOrder: true } : null) }) }),
  };
  const service = new NazraService(progressModel, studentModel, settingsModel);
  return service;
}

describe('NazraService.recordDiaryEntry', () => {
  it('rejects a Sabaq on a Para before the previous one has started', async () => {
    const progress = makeProgress();
    const service = makeService(progress);
    await expect(
      service.recordDiaryEntry('507f1f77bcf86cd799439011', 'demo-school', { sabaq: { paraNumber: 3, rating: 'proficient' } } as any, 'Teacher'),
    ).rejects.toThrow(BadRequestException);
  });

  it('advances the Para to completed on a passing Sabaq rating', async () => {
    const progress = makeProgress();
    const service = makeService(progress);
    await service.recordDiaryEntry('507f1f77bcf86cd799439011', 'demo-school', { sabaq: { paraNumber: 1, rating: 'mastered' } } as any, 'Teacher');
    expect(progress.paras[0].status).toBe('completed');
    expect(progress.currentPara).toBe(2);
    expect(progress.paras[1].status).toBe('not_started');
  });

  it('marks the Para needs_revision on a weak Sabaq rating and keeps the pointer on it', async () => {
    const progress = makeProgress();
    const service = makeService(progress);
    await service.recordDiaryEntry('507f1f77bcf86cd799439011', 'demo-school', { sabaq: { paraNumber: 1, rating: 'developing' } } as any, 'Teacher');
    expect(progress.paras[0].status).toBe('needs_revision');
    expect(progress.currentPara).toBe(1);
  });

  it('reopens an already-completed Para when its Manzil revision is weak', async () => {
    const progress = makeProgress({
      paras: NAZRA_PARAS.map((p, i) => ({
        paraNumber: p.number,
        status: i === 0 ? 'completed' : (i === 1 ? 'in_progress' : 'not_started'),
        startedDate: new Date(),
        completedDate: i === 0 ? new Date() : undefined,
        revisionCount: 0,
        attempts: [],
      })),
      currentPara: 2,
    });
    const service = makeService(progress);
    await service.recordDiaryEntry(
      '507f1f77bcf86cd799439011', 'demo-school',
      { sabaq: { paraNumber: 2, rating: 'proficient' }, manzil: { paraNumber: 1, rating: 'needs_practice' } } as any,
      'Teacher',
    );
    expect(progress.paras[0].status).toBe('needs_revision');
    expect(progress.paras[0].revisionCount).toBe(1);
  });

  it('does not reopen a completed Para when its Sabqi revision is strong', async () => {
    const progress = makeProgress({
      paras: NAZRA_PARAS.map((p, i) => ({
        paraNumber: p.number,
        status: i === 0 ? 'completed' : (i === 1 ? 'in_progress' : 'not_started'),
        startedDate: new Date(),
        completedDate: i === 0 ? new Date() : undefined,
        revisionCount: 0,
        attempts: [],
      })),
      currentPara: 2,
    });
    const service = makeService(progress);
    await service.recordDiaryEntry(
      '507f1f77bcf86cd799439011', 'demo-school',
      { sabaq: { paraNumber: 2, rating: 'proficient' }, sabqi: { paraNumber: 1, rating: 'mastered' } } as any,
      'Teacher',
    );
    expect(progress.paras[0].status).toBe('completed');
    expect(progress.paras[0].revisionCount).toBe(0);
  });

  it('records a full diary entry with sabaq, sabqi and manzil together', async () => {
    const progress = makeProgress();
    const service = makeService(progress);
    await service.recordDiaryEntry(
      '507f1f77bcf86cd799439011', 'demo-school',
      {
        sabaq: { paraNumber: 1, rating: 'proficient', pageFrom: '1', pageTo: '5' },
      } as any,
      'Teacher',
    );
    expect(progress.diaryEntries).toHaveLength(1);
    expect(progress.diaryEntries[0].sabaq.paraNumber).toBe(1);
  });
});

describe('NazraService.getProgress', () => {
  it('throws NotFoundException when no progress exists', async () => {
    const service = makeService(null);
    await expect(service.getProgress('507f1f77bcf86cd799439011', 'demo-school')).rejects.toThrow(NotFoundException);
  });
});

describe('NAZRA_PARAS', () => {
  it('has exactly 30 paras, numbered 1-30', () => {
    expect(NAZRA_PARA_COUNT).toBe(30);
    expect(NAZRA_PARAS.map((p) => p.number)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });
});

describe('NazraService reverse Mushaf order (Para 30 -> 1)', () => {
  function reverseProgress() {
    return makeProgress({
      paras: NAZRA_PARAS.map((p) => ({
        paraNumber: p.number,
        status: p.number === 30 ? 'in_progress' : 'not_started',
        startedDate: p.number === 30 ? new Date() : undefined,
        revisionCount: 0,
        attempts: [],
      })),
      currentPara: 30,
    });
  }

  it('rejects a Sabaq on Para 28 before Para 29 (the "previous" one in reverse direction) has started', async () => {
    const progress = reverseProgress();
    const service = makeService(progress, true);
    await expect(
      service.recordDiaryEntry('507f1f77bcf86cd799439011', 'demo-school', { sabaq: { paraNumber: 28, rating: 'proficient' } } as any, 'Teacher'),
    ).rejects.toThrow(BadRequestException);
  });

  it('advances the pointer from 30 down to 29 on a passing Sabaq', async () => {
    const progress = reverseProgress();
    const service = makeService(progress, true);
    await service.recordDiaryEntry('507f1f77bcf86cd799439011', 'demo-school', { sabaq: { paraNumber: 30, rating: 'mastered' } } as any, 'Teacher');
    expect(progress.paras.find((p: any) => p.paraNumber === 30)?.status).toBe('completed');
    expect(progress.currentPara).toBe(29);
  });

  it('seeds Para 30 (not Para 1) in_progress at init for a reverse-order school', async () => {
    const progress = makeProgress();
    const service = makeService(progress, true);
    await service.getOrInitProgress('507f1f77bcf86cd799439011', 'demo-school', '2025-26', {
      studentName: 'New Student', grade: 'Grade 1',
    } as any);
    const setOnInsert = (service as any).progressModel.updateOne.mock.calls[0][1].$setOnInsert;
    expect(setOnInsert.currentPara).toBe(30);
    expect(setOnInsert.paras.find((p: any) => p.paraNumber === 30).status).toBe('in_progress');
    expect(setOnInsert.paras.find((p: any) => p.paraNumber === 1).status).toBe('not_started');
  });
});

describe('NazraService not_tracked (joined-later) handling', () => {
  it('skips not_tracked Paras when recomputing the pointer', async () => {
    const progress = makeProgress({
      paras: NAZRA_PARAS.map((p) => ({
        paraNumber: p.number,
        status: p.number <= 10 ? 'not_tracked' : p.number === 11 ? 'in_progress' : 'not_started',
        revisionCount: 0,
        attempts: [],
      })),
    });
    const service = makeService(progress);
    await service.recordDiaryEntry('507f1f77bcf86cd799439011', 'demo-school', { sabaq: { paraNumber: 11, rating: 'proficient' } } as any, 'Teacher');
    expect(progress.currentPara).toBe(12);
  });

  it('seeds a joined-later student with earlier Paras not_tracked', async () => {
    const progress = makeProgress();
    const service = makeService(progress);
    await service.getOrInitProgress('507f1f77bcf86cd799439011', 'demo-school', '2025-26', {
      studentName: 'Late Joiner', grade: 'Grade 6', recordType: 'joined_later', startAtPara: 15,
    } as any);
    const setOnInsert = (service as any).progressModel.updateOne.mock.calls[0][1].$setOnInsert;
    expect(setOnInsert.recordType).toBe('joined_later');
    expect(setOnInsert.paras.filter((p: any) => p.status === 'not_tracked')).toHaveLength(14);
    expect(setOnInsert.paras.find((p: any) => p.paraNumber === 15).status).toBe('in_progress');
  });
});
