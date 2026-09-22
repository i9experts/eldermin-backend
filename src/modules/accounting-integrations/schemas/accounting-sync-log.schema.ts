import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AccountingSyncLogDocument = AccountingSyncLog & Document;

// One row per (connection, JournalEntry) - upserted, not appended, so a
// journal entry's sync state and retry count live in a single row instead
// of a growing history. "Which entries are still pending" is computed as
// "posted JournalEntry not present here with status success, or failed
// with attempts under the retry cap" - see AccountingIntegrationsService.
@Schema({ timestamps: true, collection: 'accounting_sync_logs' })
export class AccountingSyncLog {
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ type: Types.ObjectId, ref: 'AccountingConnection', required: true }) connectionId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'JournalEntry', required: true }) journalEntryId: Types.ObjectId;
  @Prop({ required: true }) entryNo: string;
  @Prop({ enum: ['success', 'failed'], required: true }) status: string;
  // The external platform's own record id (e.g. QuickBooks JournalEntry.Id) once synced.
  @Prop() externalId: string;
  @Prop() errorMessage: string;
  @Prop({ default: 0 }) attempts: number;
  @Prop() lastAttemptAt: Date;
}
export const AccountingSyncLogSchema = SchemaFactory.createForClass(AccountingSyncLog);
AccountingSyncLogSchema.index({ connectionId: 1, journalEntryId: 1 }, { unique: true });
AccountingSyncLogSchema.index({ schoolSlug: 1, status: 1 });
