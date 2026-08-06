// ============================================================
// BANK RECONCILIATION — Eldermin ERP | NestJS + MongoDB
// Phase 6 of the Odoo-standard finance rebuild: bank statement
// import/entry, matching against posted Cash/Bank journal lines, and a
// lightweight "close out the period" session on top of that matching.
// See claude/finance-module-odoo-standard-build-plan.md.
//
// Sign convention for BankStatementLine.amount: POSITIVE = a deposit/
// credit to the bank account (money in, as reported by the bank
// statement); NEGATIVE = a withdrawal/debit (money out). This mirrors how
// a bank statement itself reads (deposits positive, withdrawals
// negative) rather than the ledger's own debit/credit convention for the
// account — the two are reconciled explicitly in getReconciliationSummary,
// not assumed to match sign-for-sign.
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ============================================================
// BANK STATEMENT LINE
// ============================================================
export type BankStatementLineDocument = BankStatementLine & Document;

// Denormalized snapshot of one journal-entry line a statement line was
// matched to — stored (rather than only a live ref) so the UI can render
// "matched to: [narration] on [date] for [amount]" without an extra
// populate, and so the match survives even if the journal entry's own
// narration is later edited. A single statement line can match MANY
// journal-entry lines (Phase 6's answer to "the bank batched several fee
// payments into one lump-sum deposit") — see matchStatementLine.
@Schema({ _id: false })
class StatementLineMatch {
  @Prop({ type: Types.ObjectId, ref: 'JournalEntry', required: true }) entryId: Types.ObjectId;
  @Prop({ required: true }) lineIndex: number; // index into JournalEntry.lines for the specific matched line
  @Prop() entryNo: string;
  @Prop() narration: string;
  @Prop() date: Date;
  @Prop() amount: number;
}
const StatementLineMatchSchema = SchemaFactory.createForClass(StatementLineMatch);

@Schema({ timestamps: true, collection: 'bank_statement_lines' })
export class BankStatementLine {
  @Prop({ type: Types.ObjectId, ref: 'BankAccount', required: true, index: true }) bankAccountId: Types.ObjectId;
  @Prop({ required: true }) statementDate: Date;
  @Prop() description: string;
  @Prop() referenceNumber: string;
  // Positive = deposit/credit; negative = withdrawal/debit. See file header.
  @Prop({ required: true }) amount: number;
  @Prop() runningBalance: number; // as reported by the bank statement itself, for cross-checking only
  @Prop({ enum: ['unmatched', 'matched', 'ignored'], default: 'unmatched', index: true }) status: string;
  @Prop({ type: [StatementLineMatchSchema], default: [] }) matches: StatementLineMatch[];
  // Groups lines imported together so a whole import can be identified (and,
  // if ever needed, undone) as a batch rather than line-by-line.
  @Prop({ index: true }) importBatchId: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const BankStatementLineSchema = SchemaFactory.createForClass(BankStatementLine);
BankStatementLineSchema.index({ schoolSlug: 1, bankAccountId: 1, statementDate: -1 });
BankStatementLineSchema.index({ schoolSlug: 1, bankAccountId: 1, status: 1 });

// ============================================================
// BANK RECONCILIATION (session) — a lightweight "close out the month"
// wrapper around the matching above. Deliberately not a full period-lock
// mechanism (Accounting Periods from Phase 1 already own that at the
// ledger level) — this just snapshots statement-vs-book balances at a
// point in time and records who signed off on them.
// ============================================================
export type BankReconciliationDocument = BankReconciliation & Document;

@Schema({ timestamps: true, collection: 'bank_reconciliations' })
export class BankReconciliation {
  @Prop({ type: Types.ObjectId, ref: 'BankAccount', required: true, index: true }) bankAccountId: Types.ObjectId;
  @Prop({ required: true }) periodEnd: Date;
  @Prop({ default: 0 }) statementEndingBalance: number;
  @Prop({ default: 0 }) bookEndingBalance: number;
  @Prop({ default: 0 }) difference: number;
  @Prop({ enum: ['in_progress', 'completed'], default: 'in_progress' }) status: string;
  @Prop() completedBy: string;
  @Prop() completedAt: Date;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const BankReconciliationSchema = SchemaFactory.createForClass(BankReconciliation);
BankReconciliationSchema.index({ schoolSlug: 1, bankAccountId: 1, periodEnd: -1 });
