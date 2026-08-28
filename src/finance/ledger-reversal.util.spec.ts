import { reverseJournalLines, isReversible } from './ledger-reversal.util';

describe('reverseJournalLines', () => {
  it('swaps debit and credit on every line', () => {
    const lines = [
      { accountCode: '1010', debit: 5000, credit: 0 },
      { accountCode: '1200', debit: 0, credit: 5000 },
    ];
    const reversed = reverseJournalLines(lines);
    expect(reversed).toEqual([
      { accountCode: '1010', costCenterName: undefined, debit: 0, credit: 5000, partnerType: undefined, partnerId: undefined, partnerName: undefined, taxTemplateName: undefined, bankAccountId: undefined, bankAccountName: undefined },
      { accountCode: '1200', costCenterName: undefined, debit: 5000, credit: 0, partnerType: undefined, partnerId: undefined, partnerName: undefined, taxTemplateName: undefined, bankAccountId: undefined, bankAccountName: undefined },
    ]);
  });

  it('still balances after reversal (total debit == total credit)', () => {
    const lines = [
      { accountCode: '1010', debit: 1200, credit: 0 },
      { accountCode: '1200', debit: 0, credit: 1000 },
      { accountCode: '2400', debit: 0, credit: 200 },
    ];
    const reversed = reverseJournalLines(lines);
    const totalDebit = reversed.reduce((s, l) => s + (l.debit || 0), 0);
    const totalCredit = reversed.reduce((s, l) => s + (l.credit || 0), 0);
    expect(totalDebit).toBe(totalCredit);
    expect(totalDebit).toBe(1200);
  });

  it('carries through partner/cost-center/bank metadata unchanged', () => {
    const lines = [
      { accountCode: '1010', debit: 500, credit: 0, partnerType: 'student', partnerId: 's1', partnerName: 'Ali', costCenterName: 'Main Campus', bankAccountId: 'b1', bankAccountName: 'HBL — Main' },
    ];
    const [reversed] = reverseJournalLines(lines);
    expect(reversed.partnerType).toBe('student');
    expect(reversed.partnerId).toBe('s1');
    expect(reversed.partnerName).toBe('Ali');
    expect(reversed.costCenterName).toBe('Main Campus');
    expect(reversed.bankAccountId).toBe('b1');
    expect(reversed.bankAccountName).toBe('HBL — Main');
  });

  it('returns an empty array for no lines', () => {
    expect(reverseJournalLines([])).toEqual([]);
    expect(reverseJournalLines(undefined as any)).toEqual([]);
  });
});

describe('isReversible', () => {
  it('is true for a posted entry', () => {
    expect(isReversible({ status: 'posted' })).toBe(true);
  });

  it('is false for an already-reversed entry', () => {
    expect(isReversible({ status: 'reversed' })).toBe(false);
  });

  it('is false for null/undefined (nothing was ever posted)', () => {
    expect(isReversible(null)).toBe(false);
    expect(isReversible(undefined)).toBe(false);
  });
});
