import { StudentsService } from './students.service';

// Pins the fix for "No active students found for Grade-1" on Assessments'
// Enter Marks screen. getStudents filtered currentGrade/currentSection with
// a raw exact-match $in against free-text fields that have no FK to the
// real Grade/Section master (same bug class as getDistinctGradesSections,
// PR #209) - an Assessment's grade field (sourced from the real master,
// e.g. "GRADE-1") matched zero students whose currentGrade was written in
// a different format by an older enrollment path (e.g. "Grade-1"). The
// filter now uses the same gradeMatcher/sectionMatcher regex helpers
// already used for teacher-class scoping.

function makeService(studentModel: any) {
  const n: any = {};
  const emptyLeanFind: any = { find: () => ({ lean: () => Promise.resolve([]) }) };
  return new StudentsService(
    studentModel, n, n, n, n, n, n, n, n, n,
    emptyLeanFind, emptyLeanFind, n, n, n, n, n, n, n, n, n,
  );
}

function chainable(result: any[]) {
  const chain: any = {
    select: () => chain, sort: () => chain, skip: () => chain,
    limit: () => Promise.resolve(result),
  };
  return chain;
}

describe('StudentsService.getStudents — grade/section filter tolerance', () => {
  it('matches a student whose currentGrade differs only in case/format from the queried grade', async () => {
    const studentModel: any = {
      find: jest.fn(() => chainable([])),
      countDocuments: jest.fn(async () => 0),
    };
    const svc = makeService(studentModel);

    await svc.getStudents('school', { grade: ['GRADE-1'], page: 1, limit: 20 } as any);

    const [filter] = studentModel.find.mock.calls[0];
    const matchers: RegExp[] = filter.currentGrade.$in;
    expect(matchers).toHaveLength(1);
    // The exact real-world mismatch reported: Assessment.grade = "GRADE-1"
    // (from the master), Student.currentGrade = "Grade-1" (legacy import).
    expect(matchers[0].test('Grade-1')).toBe(true);
    expect(matchers[0].test('grade 1')).toBe(true);
    expect(matchers[0].test('GRADE-1')).toBe(true);
    expect(matchers[0].test('Grade-11')).toBe(false);
    expect(matchers[0].test('Grade-2')).toBe(false);
  });

  it('matches a section filter tolerant of case/format the same way', async () => {
    const studentModel: any = {
      find: jest.fn(() => chainable([])),
      countDocuments: jest.fn(async () => 0),
    };
    const svc = makeService(studentModel);

    await svc.getStudents('school', { grade: ['GRADE-1'], section: ['Section A'], page: 1, limit: 20 } as any);

    const [filter] = studentModel.find.mock.calls[0];
    const matchers: RegExp[] = filter.currentSection.$in;
    expect(matchers[0].test('A')).toBe(true);
    expect(matchers[0].test('a')).toBe(true);
    expect(matchers[0].test('B')).toBe(false);
  });
});
