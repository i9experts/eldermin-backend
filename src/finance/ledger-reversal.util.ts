// Pure, framework-free helper for reversing a posted JournalEntry's lines -
// kept dependency-free (like fee-assignment.util.ts / invoice-adjustment.util.ts)
// so the debit/credit-swap arithmetic is directly unit-testable without
// mocking Mongoose models/documents. Mirrors the reversal convention already
// established by FinanceService.cancelVoucher (swap every line's debit/credit,
// never delete the original) and HrService.reversePayslipLedgerEntry (post
// the mirror image as a new entry, flag the original reversed) - this just
// factors the "swap the lines" arithmetic out of both into one tested place.

export interface JournalLineLike {
  accountCode: string;
  debit?: number;
  credit?: number;
  costCenterName?: string | null;
  partnerType?: string | null;
  partnerId?: string | null;
  partnerName?: string | null;
  taxTemplateName?: string | null;
  bankAccountId?: string | null;
  bankAccountName?: string | null;
}

/**
 * Returns the mirror-image lines for a reversing journal entry: every
 * line's debit and credit are swapped, everything else (account, partner,
 * cost center, bank account) is carried through unchanged so the reversal
 * hits the exact same accounts/partners as the original posting.
 */
export function reverseJournalLines<T extends JournalLineLike>(lines: T[]): JournalLineLike[] {
  return (lines || []).map((l) => ({
    accountCode: l.accountCode,
    costCenterName: l.costCenterName,
    debit: l.credit || 0,
    credit: l.debit || 0,
    partnerType: l.partnerType,
    partnerId: l.partnerId,
    partnerName: l.partnerName,
    taxTemplateName: l.taxTemplateName,
    bankAccountId: l.bankAccountId,
    bankAccountName: l.bankAccountName,
  }));
}

/**
 * True when a JournalEntry-like document should still be reversed (it was
 * actually posted and hasn't already been reversed once) - guards against
 * double-reversing the same entry.
 */
export function isReversible(entry: { status?: string } | null | undefined): boolean {
  return !!entry && entry.status !== 'reversed';
}
