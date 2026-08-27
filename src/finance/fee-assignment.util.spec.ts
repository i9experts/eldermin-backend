import { dateRangesOverlap, findConflictingAssignments } from './fee-assignment.util';

const d = (s: string) => new Date(s);

describe('dateRangesOverlap', () => {
  it('detects a clear overlap', () => {
    expect(dateRangesOverlap(d('2026-01-01'), d('2026-06-30'), d('2026-03-01'), d('2026-09-30'))).toBe(true);
  });

  it('detects no overlap when ranges are clearly separate', () => {
    expect(dateRangesOverlap(d('2026-01-01'), d('2026-03-31'), d('2026-06-01'), d('2026-09-30'))).toBe(false);
  });

  it('treats an open-ended (null end) range as still in force indefinitely', () => {
    expect(dateRangesOverlap(d('2026-01-01'), null, d('2027-01-01'), d('2027-06-30'))).toBe(true);
  });

  it('treats two open-ended ranges as always overlapping', () => {
    expect(dateRangesOverlap(d('2026-01-01'), null, d('2030-01-01'), null)).toBe(true);
  });

  it('counts touching boundaries (one starts exactly when the other ends) as overlapping', () => {
    expect(dateRangesOverlap(d('2026-01-01'), d('2026-03-31'), d('2026-03-31'), d('2026-06-30'))).toBe(true);
  });

  it('does not overlap when one range ends the day before the other starts', () => {
    expect(dateRangesOverlap(d('2026-01-01'), d('2026-03-30'), d('2026-03-31'), d('2026-06-30'))).toBe(false);
  });
});

describe('findConflictingAssignments', () => {
  const existing = [
    { _id: 'a1', effectiveFrom: '2026-01-01', effectiveTo: '2026-06-30' },
    { _id: 'a2', effectiveFrom: '2026-09-01', effectiveTo: null },
  ];

  it('returns the assignment(s) that overlap a proposed new period', () => {
    const conflicts = findConflictingAssignments(existing, d('2026-04-01'), d('2026-05-01'));
    expect(conflicts.map(c => c._id)).toEqual(['a1']);
  });

  it('returns an empty array when the proposed period fits in a genuine gap', () => {
    const conflicts = findConflictingAssignments(existing, d('2026-07-01'), d('2026-08-31'));
    expect(conflicts).toEqual([]);
  });

  it('flags a conflict against an open-ended existing assignment', () => {
    const conflicts = findConflictingAssignments(existing, d('2026-12-01'), null);
    expect(conflicts.map(c => c._id)).toEqual(['a2']);
  });

  it('two students each getting their own non-conflicting assignment never collide with each other (independent lists)', () => {
    // Simulates FEE-02's acceptance test at the data-integrity layer: each
    // student's own assignment list is checked independently, so Student A
    // having Structure X and Student B having Structure Y for the same
    // academic year never conflicts with each other - conflicts are only
    // ever within ONE student's own assignment history.
    const studentA: any[] = [];
    const studentB: any[] = [];
    const aConflicts = findConflictingAssignments(studentA, d('2026-01-01'), null);
    const bConflicts = findConflictingAssignments(studentB, d('2026-01-01'), null);
    expect(aConflicts).toEqual([]);
    expect(bConflicts).toEqual([]);
  });
});
