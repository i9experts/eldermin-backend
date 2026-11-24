import { Types } from 'mongoose';
import { NazraService } from './nazra.service';
import { NAZRA_PARAS } from './schemas/nazra-progress.schema';

// Quick Class Recording: a good lesson only finishes the Para when the
// teacher says so, and a whole class is saved in one request where one
// student's problem never blocks the others.

const SCHOOL = 'demo-school';

function makeProgress() {
  return {
    paras: NAZRA_PARAS.map((p, i) => ({
      paraNumber: p.number,
      status: i === 0 ? 'in_progress' : 'not_started',
      startedDate: i === 0 ? new Date() : undefined,
      revisionCount: 0,
      attempts: [] as any[],
    })),
    currentPara: 1,
    overallStatus: 'in_progress',
    diaryEntries: [] as any[],
    save: jest.fn().mockResolvedValue(undefined),
  };
}

function build(opts: { progressById?: Record<string, any>; schoolStudentIds?: string[] } = {}) {
  const progressById = opts.progressById ?? {};
  const progressModel: any = {
    findOne: jest.fn(({ studentId }: any) => Promise.resolve(progressById[String(studentId)] ?? null)),
    updateOne: jest.fn(async ({ studentId }: any) => {
      // the upsert in getOrInitProgress: a brand-new student gets a fresh record
      if (!progressById[String(studentId)]) progressById[String(studentId)] = makeProgress();
    }),
  };
  const studentModel: any = {
    find: jest.fn(() => ({
      select: () => ({ lean: () => Promise.resolve((opts.schoolStudentIds ?? []).map((id) => ({ _id: new Types.ObjectId(id) }))) }),
    })),
  };
  const settingsModel: any = {
    findOne: jest.fn().mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) }),
  };
  return { service: new NazraService(progressModel, studentModel, settingsModel), progressById, studentModel };
}

describe('Sabaq completesPara', () => {
  const id = new Types.ObjectId().toHexString();

  it('a good lesson with completesPara: false keeps the Para open and the student on it', async () => {
    const progress = makeProgress();
    const { service } = build({ progressById: { [id]: progress } });
    await service.recordDiaryEntry(id, SCHOOL, { sabaq: { paraNumber: 1, rating: 'mastered', completesPara: false } } as any, 'T');
    expect(progress.paras[0].status).toBe('in_progress');
    expect(progress.currentPara).toBe(1);
  });

  it('completesPara: true finishes the Para and moves the student on', async () => {
    const progress = makeProgress();
    const { service } = build({ progressById: { [id]: progress } });
    await service.recordDiaryEntry(id, SCHOOL, { sabaq: { paraNumber: 1, rating: 'proficient', completesPara: true } } as any, 'T');
    expect(progress.paras[0].status).toBe('completed');
    expect(progress.currentPara).toBe(2);
  });

  it('a good lesson after a weak one clears needs_revision back to in_progress', async () => {
    const progress = makeProgress();
    progress.paras[0].status = 'needs_revision';
    const { service } = build({ progressById: { [id]: progress } });
    await service.recordDiaryEntry(id, SCHOOL, { sabaq: { paraNumber: 1, rating: 'proficient', completesPara: false } } as any, 'T');
    expect(progress.paras[0].status).toBe('in_progress');
  });

  it('a weak lesson still flags needs_revision even if completesPara was ticked', async () => {
    const progress = makeProgress();
    const { service } = build({ progressById: { [id]: progress } });
    await service.recordDiaryEntry(id, SCHOOL, { sabaq: { paraNumber: 1, rating: 'needs_practice', completesPara: true } } as any, 'T');
    expect(progress.paras[0].status).toBe('needs_revision');
  });

  it('omitting completesPara keeps the old behaviour (passing rating completes)', async () => {
    const progress = makeProgress();
    const { service } = build({ progressById: { [id]: progress } });
    await service.recordDiaryEntry(id, SCHOOL, { sabaq: { paraNumber: 1, rating: 'proficient' } } as any, 'T');
    expect(progress.paras[0].status).toBe('completed');
  });
});

describe('NazraService.recordClassDiary', () => {
  const a = new Types.ObjectId().toHexString();
  const b = new Types.ObjectId().toHexString();
  const outsider = new Types.ObjectId().toHexString();
  const entry = (studentId: string, sabaq: any) => ({ studentId, studentName: 'S', sabaq });

  it('records every student in one call and starts tracking for students who had no record yet', async () => {
    const existing = makeProgress();
    const { service, progressById } = build({ progressById: { [a]: existing }, schoolStudentIds: [a, b] });
    const res = await service.recordClassDiary(SCHOOL, '2026-27', {
      grade: 'Grade 3', section: 'A',
      entries: [
        entry(a, { paraNumber: 1, rating: 'proficient', completesPara: false, surahNumber: 2, surahName: 'Al-Baqarah', ayahFrom: 1, ayahTo: 5 }),
        entry(b, { paraNumber: 1, rating: 'developing', completesPara: false }),
      ],
    } as any, 'Teacher');
    expect(res).toMatchObject({ saved: 2, failed: 0 });
    expect(existing.diaryEntries).toHaveLength(1);
    expect(progressById[b].diaryEntries).toHaveLength(1);
  });

  it("one student's invalid lesson fails only that student, the rest still save", async () => {
    const { service } = build({ progressById: { [a]: makeProgress(), [b]: makeProgress() }, schoolStudentIds: [a, b] });
    const res = await service.recordClassDiary(SCHOOL, '2026-27', {
      grade: 'Grade 3',
      entries: [
        entry(a, { paraNumber: 1, rating: 'proficient', surahNumber: 1, ayahFrom: 1, ayahTo: 9 }), // Al-Fatihah has 7
        entry(b, { paraNumber: 1, rating: 'proficient', completesPara: false }),
      ],
    } as any, 'Teacher');
    expect(res.saved).toBe(1);
    expect(res.results.find((r) => r.studentId === a)).toMatchObject({ ok: false });
    expect(res.results.find((r) => r.studentId === a)!.error).toMatch(/7 ayahs/);
    expect(res.results.find((r) => r.studentId === b)).toMatchObject({ ok: true });
  });

  it('never creates a record for a student who is not in this school', async () => {
    const { service, progressById } = build({ schoolStudentIds: [a] });
    const res = await service.recordClassDiary(SCHOOL, '2026-27', {
      grade: 'Grade 3', entries: [entry(outsider, { paraNumber: 1, rating: 'proficient' })],
    } as any, 'Teacher');
    expect(res).toMatchObject({ saved: 0, failed: 1 });
    expect(progressById[outsider]).toBeUndefined();
  });
});
