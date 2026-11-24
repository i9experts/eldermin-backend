import { Types } from 'mongoose';
import { QaidaService } from './qaida.service';
import { QAIDA_TAKHTIS } from './schemas/qaida-progress.schema';

// Quick Class Recording: a good sabaq only masters the board when the
// teacher says so, and a whole class is saved in one request where one
// student's problem never blocks the others.

const SCHOOL = 'demo-school';

function makeProgress() {
  return {
    takhtis: QAIDA_TAKHTIS.map((t, i) => ({
      takhtiNumber: t.number,
      status: i === 0 ? 'in_progress' : 'not_started',
      startedDate: i === 0 ? new Date() : undefined,
      revisionCount: 0,
      attempts: [] as any[],
    })),
    currentTakhti: 1,
    overallStatus: 'in_progress',
    save: jest.fn().mockResolvedValue(undefined),
  };
}

function build(opts: { progressById?: Record<string, any>; schoolStudentIds?: string[]; extraStudents?: any[] } = {}) {
  const progressById = opts.progressById ?? {};
  const progressModel: any = {
    findOne: jest.fn(({ studentId }: any) => Promise.resolve(progressById[String(studentId)] ?? null)),
    updateOne: jest.fn(async ({ studentId }: any) => {
      if (!progressById[String(studentId)]) progressById[String(studentId)] = makeProgress();
    }),
    find: jest.fn(() => ({ lean: () => Promise.resolve(Object.entries(progressById).map(([id, p]) => ({ ...p, studentId: id }))) })),
  };
  const studentModel: any = {
    find: jest.fn(() => ({
      select: () => {
        const ids = (opts.schoolStudentIds ?? []).map((id) => ({ _id: new Types.ObjectId(id), firstName: 'S' }));
        const chain: any = { lean: () => Promise.resolve(ids), sort: () => chain };
        return chain;
      },
    })),
  };
  return { service: new QaidaService(progressModel, studentModel), progressById };
}

describe('Qaida completesTakhti', () => {
  const id = new Types.ObjectId().toHexString();

  it('a good sabaq with completesTakhti: false keeps the board open and the student on it', async () => {
    const progress = makeProgress();
    const { service } = build({ progressById: { [id]: progress } });
    await service.recordAttempt(id, SCHOOL, { takhtiNumber: 1, rating: 'mastered', completesTakhti: false, sabaqFrom: 'Alif', sabaqTo: 'Tha' } as any, 'T');
    expect(progress.takhtis[0].status).toBe('in_progress');
    expect(progress.currentTakhti).toBe(1);
  });

  it('completesTakhti: true masters the board and moves the student on', async () => {
    const progress = makeProgress();
    const { service } = build({ progressById: { [id]: progress } });
    await service.recordAttempt(id, SCHOOL, { takhtiNumber: 1, rating: 'proficient', completesTakhti: true } as any, 'T');
    expect(progress.takhtis[0].status).toBe('mastered');
    expect(progress.currentTakhti).toBe(2);
  });

  it('a good sabaq after a weak one clears needs_revision back to in_progress', async () => {
    const progress = makeProgress();
    progress.takhtis[0].status = 'needs_revision';
    const { service } = build({ progressById: { [id]: progress } });
    await service.recordAttempt(id, SCHOOL, { takhtiNumber: 1, rating: 'proficient', completesTakhti: false } as any, 'T');
    expect(progress.takhtis[0].status).toBe('in_progress');
  });

  it('a weak sabaq still flags needs_revision even if completesTakhti was ticked', async () => {
    const progress = makeProgress();
    const { service } = build({ progressById: { [id]: progress } });
    await service.recordAttempt(id, SCHOOL, { takhtiNumber: 1, rating: 'needs_practice', completesTakhti: true } as any, 'T');
    expect(progress.takhtis[0].status).toBe('needs_revision');
  });

  it('omitting completesTakhti keeps the old behaviour (passing rating masters)', async () => {
    const progress = makeProgress();
    const { service } = build({ progressById: { [id]: progress } });
    await service.recordAttempt(id, SCHOOL, { takhtiNumber: 1, rating: 'proficient' } as any, 'T');
    expect(progress.takhtis[0].status).toBe('mastered');
  });
});

describe('QaidaService.recordClassAttempts', () => {
  const a = new Types.ObjectId().toHexString();
  const b = new Types.ObjectId().toHexString();
  const outsider = new Types.ObjectId().toHexString();

  it('records every student in one call and starts tracking for students who had no record yet', async () => {
    const existing = makeProgress();
    const { service, progressById } = build({ progressById: { [a]: existing }, schoolStudentIds: [a, b] });
    const res = await service.recordClassAttempts(SCHOOL, '2026-27', {
      grade: 'Grade 1', section: 'A',
      entries: [
        { studentId: a, studentName: 'A', takhtiNumber: 1, rating: 'proficient', completesTakhti: false, sabaqFrom: 'Alif', sabaqTo: 'Tha' },
        { studentId: b, studentName: 'B', takhtiNumber: 1, rating: 'developing', completesTakhti: false },
      ],
    } as any, 'Teacher');
    expect(res).toMatchObject({ saved: 2, failed: 0 });
    expect(existing.takhtis[0].attempts).toHaveLength(1);
    expect(existing.takhtis[0].attempts[0]).toMatchObject({ sabaqFrom: 'Alif', sabaqTo: 'Tha', rating: 'proficient' });
    expect(progressById[b].takhtis[0].attempts).toHaveLength(1);
  });

  it("one student's failure fails only that student, the rest still save", async () => {
    const broken: any = makeProgress();
    broken.save = jest.fn().mockRejectedValue(new Error('write conflict'));
    const { service } = build({ progressById: { [a]: broken, [b]: makeProgress() }, schoolStudentIds: [a, b] });
    const res = await service.recordClassAttempts(SCHOOL, '2026-27', {
      grade: 'Grade 1',
      entries: [
        { studentId: a, studentName: 'A', takhtiNumber: 1, rating: 'proficient' },
        { studentId: b, studentName: 'B', takhtiNumber: 1, rating: 'proficient' },
      ],
    } as any, 'Teacher');
    expect(res.saved).toBe(1);
    expect(res.results.find((r) => r.studentId === a)).toMatchObject({ ok: false, error: 'write conflict' });
    expect(res.results.find((r) => r.studentId === b)).toMatchObject({ ok: true });
  });

  it('never creates a record for a student who is not in this school', async () => {
    const { service, progressById } = build({ schoolStudentIds: [a] });
    const res = await service.recordClassAttempts(SCHOOL, '2026-27', {
      grade: 'Grade 1', entries: [{ studentId: outsider, studentName: 'X', takhtiNumber: 1, rating: 'proficient' }],
    } as any, 'Teacher');
    expect(res).toMatchObject({ saved: 0, failed: 1 });
    expect(progressById[outsider]).toBeUndefined();
  });
});

describe('Qaida class roster lastAttempt', () => {
  it('returns the most recent sabaq across all boards', async () => {
    const a = new Types.ObjectId().toHexString();
    const progress: any = makeProgress();
    progress.takhtis[0].attempts.push({ date: new Date('2026-11-20'), rating: 'mastered', sabaqFrom: 'Alif', sabaqTo: 'Tha' });
    progress.takhtis[3].attempts.push({ date: new Date('2026-11-22'), rating: 'developing', sabaqFrom: 'Ba', sabaqTo: 'Jeem' });
    progress.takhtis[1].attempts.push({ date: new Date('2026-11-21'), rating: 'proficient' });
    const { service } = build({ progressById: { [a]: progress }, schoolStudentIds: [a] });
    const [row] = await service.getClassProgress(SCHOOL, 'Grade 1', undefined);
    expect(row.lastAttempt).toMatchObject({ takhtiNumber: 4, sabaqFrom: 'Ba', sabaqTo: 'Jeem', rating: 'developing' });
  });
});
