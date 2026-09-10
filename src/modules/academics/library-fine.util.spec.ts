import { computeLibraryFine } from './library-fine.util';

const day = (n: number) => new Date(Date.UTC(2026, 0, n));

describe('computeLibraryFine', () => {
  it('charges nothing when the book is not overdue', () => {
    expect(computeLibraryFine(day(10), day(5), { finePerDay: 5, gracePeriodDays: 0, maxFineCap: 0 }))
      .toEqual({ overdueDays: 0, fineAmount: 0 });
    expect(computeLibraryFine(day(10), day(10), { finePerDay: 5, gracePeriodDays: 0, maxFineCap: 0 }))
      .toEqual({ overdueDays: 0, fineAmount: 0 });
  });

  it('charges finePerDay per day overdue with no grace period or cap', () => {
    expect(computeLibraryFine(day(1), day(6), { finePerDay: 5, gracePeriodDays: 0, maxFineCap: 0 }))
      .toEqual({ overdueDays: 5, fineAmount: 25 });
  });

  it('subtracts the grace period from days overdue before charging', () => {
    expect(computeLibraryFine(day(1), day(6), { finePerDay: 5, gracePeriodDays: 2, maxFineCap: 0 }))
      .toEqual({ overdueDays: 3, fineAmount: 15 });
  });

  it('never goes below zero overdue days when entirely within the grace period', () => {
    expect(computeLibraryFine(day(1), day(2), { finePerDay: 5, gracePeriodDays: 5, maxFineCap: 0 }))
      .toEqual({ overdueDays: 0, fineAmount: 0 });
  });

  it('clamps the fine to maxFineCap when the cap is a positive number', () => {
    expect(computeLibraryFine(day(1), day(20), { finePerDay: 5, gracePeriodDays: 0, maxFineCap: 50 }))
      .toEqual({ overdueDays: 19, fineAmount: 50 });
  });

  it('treats maxFineCap of 0 as "no cap", not "no fine"', () => {
    expect(computeLibraryFine(day(1), day(20), { finePerDay: 5, gracePeriodDays: 0, maxFineCap: 0 }))
      .toEqual({ overdueDays: 19, fineAmount: 95 });
  });
});
