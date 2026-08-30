import { computeDsarDueDate, isDsarOverdue, formatRetentionPeriod, DSAR_RESPONSE_WINDOW_DAYS } from './data-privacy.util';

describe('computeDsarDueDate', () => {
  it('adds 30 days to the received date', () => {
    const received = new Date('2026-01-01T00:00:00.000Z');
    const due = computeDsarDueDate(received);
    expect(due.toISOString().slice(0, 10)).toBe('2026-01-31');
  });

  it('matches DSAR_RESPONSE_WINDOW_DAYS', () => {
    const received = new Date('2026-06-15T00:00:00.000Z');
    const due = computeDsarDueDate(received);
    const diffDays = Math.round((due.getTime() - received.getTime()) / 86400000);
    expect(diffDays).toBe(DSAR_RESPONSE_WINDOW_DAYS);
  });

  it('does not mutate the input date', () => {
    const received = new Date('2026-01-01T00:00:00.000Z');
    const original = received.getTime();
    computeDsarDueDate(received);
    expect(received.getTime()).toBe(original);
  });
});

describe('isDsarOverdue', () => {
  it('is overdue when now is past the due date and status is not final', () => {
    const due = new Date('2026-01-01T00:00:00.000Z');
    const now = new Date('2026-01-02T00:00:00.000Z');
    expect(isDsarOverdue(due, 'in_progress', now)).toBe(true);
    expect(isDsarOverdue(due, 'received', now)).toBe(true);
  });

  it('is not overdue before the due date', () => {
    const due = new Date('2026-01-10T00:00:00.000Z');
    const now = new Date('2026-01-02T00:00:00.000Z');
    expect(isDsarOverdue(due, 'in_progress', now)).toBe(false);
  });

  it('is never overdue once completed or rejected, even past due date', () => {
    const due = new Date('2026-01-01T00:00:00.000Z');
    const now = new Date('2026-06-01T00:00:00.000Z');
    expect(isDsarOverdue(due, 'completed', now)).toBe(false);
    expect(isDsarOverdue(due, 'rejected', now)).toBe(false);
  });
});

describe('formatRetentionPeriod', () => {
  it('pluralizes the unit for values other than 1', () => {
    expect(formatRetentionPeriod(7, 'years')).toBe('7 years');
    expect(formatRetentionPeriod(6, 'months')).toBe('6 months');
    expect(formatRetentionPeriod(90, 'days')).toBe('90 days');
  });

  it('singularizes the unit for a value of exactly 1', () => {
    expect(formatRetentionPeriod(1, 'years')).toBe('1 year');
    expect(formatRetentionPeriod(1, 'months')).toBe('1 month');
    expect(formatRetentionPeriod(1, 'days')).toBe('1 day');
  });

  it('throws for a non-positive value', () => {
    expect(() => formatRetentionPeriod(0, 'years')).toThrow();
    expect(() => formatRetentionPeriod(-1, 'years')).toThrow();
  });
});
