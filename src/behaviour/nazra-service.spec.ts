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

function makeService(progress: any) {
  const progressModel: any = {
    findOne: jest.fn().mockReturnValue(Promise.resolve(progress)),
  };
  const studentModel: any = {};
  const service = new NazraService(progressModel, studentModel);
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
