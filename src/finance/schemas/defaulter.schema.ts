import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ============================================================
// FEE DEFAULTER ENGINE
// ============================================================
// Real, code-complete reminder/escalation workflow for overdue fee
// invoices - aging buckets, severity scale, automated + manual
// reminders across channels, penalty application, and installment
// commitment plans for chronic defaulters. Matches the depth EDAP's
// presentation shows for this exact workflow.
//
// Channel honesty: email actually sends (AWS SES is really configured).
// SMS/WhatsApp genuinely attempt to send via SmsService/WhatsAppService,
// which are real integration points that honestly report "not sent -
// no gateway configured" until real provider credentials exist. Every
// attempt is logged here regardless of whether it actually went out, so
// the audit trail is honest about what happened.
// ============================================================

export type DefaulterReminderLogDocument = DefaulterReminderLog & Document;

@Schema({ timestamps: true, collection: 'defaulter_reminder_logs' })
export class DefaulterReminderLog {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Invoice' }) invoiceId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Student' }) studentId: Types.ObjectId;
  @Prop({ required: true }) studentName: string;
  @Prop({ required: true, enum: ['email', 'sms', 'whatsapp'] }) channel: string;
  @Prop({ required: true, enum: ['sent', 'failed', 'skipped'] }) status: string;
  @Prop() reason: string; // failure/skip reason, e.g. gateway not configured, already reminded recently
  @Prop({ required: true, enum: ['minor_concern', 'concern', 'major_concern'] }) severityAtSendTime: string;
  @Prop({ required: true }) daysOverdueAtSendTime: number;
  @Prop({ required: true }) amountDue: number;
  // 'automated' = sent by the daily cron job; 'manual' = a staff member
  // clicked "send reminder" (individually or as part of a bulk action).
  @Prop({ required: true, enum: ['automated', 'manual'] }) trigger: string;
  @Prop() sentBy: string; // staff name, only set for trigger:'manual'
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ type: Types.ObjectId, ref: 'Campus', default: null }) campusId: Types.ObjectId | null;
}
export const DefaulterReminderLogSchema = SchemaFactory.createForClass(DefaulterReminderLog);
DefaulterReminderLogSchema.index({ schoolSlug: 1, invoiceId: 1, createdAt: -1 });
DefaulterReminderLogSchema.index({ schoolSlug: 1, studentId: 1, createdAt: -1 });

// ============================================================
// PAYMENT COMMITMENT — installment/promise-to-pay plan for chronic
// defaulters, matching EDAP's "Commitment" process.
// ============================================================

@Schema({ _id: true })
export class CommitmentInstallment {
  @Prop({ required: true }) installmentNumber: number;
  @Prop({ required: true }) amount: number;
  @Prop({ required: true }) dueDate: Date;
  @Prop({ enum: ['pending', 'paid', 'missed'], default: 'pending' }) status: string;
  @Prop() paidDate: Date;
  @Prop() paidAmount: number;
  @Prop({ type: Types.ObjectId, ref: 'Payment', default: null }) paymentId: Types.ObjectId | null;
}
export const CommitmentInstallmentSchema = SchemaFactory.createForClass(CommitmentInstallment);

export type PaymentCommitmentDocument = PaymentCommitment & Document;

@Schema({ timestamps: true, collection: 'payment_commitments' })
export class PaymentCommitment {
  @Prop({ required: true, unique: true }) commitmentNumber: string; // PC-2026-0001
  @Prop({ required: true, type: Types.ObjectId, ref: 'Student' }) studentId: Types.ObjectId;
  @Prop({ required: true }) studentName: string;
  @Prop({ type: [Types.ObjectId], ref: 'Invoice', default: [] }) invoiceIds: Types.ObjectId[];
  @Prop({ required: true }) totalAmount: number;
  @Prop({ type: [CommitmentInstallmentSchema], default: [] }) installments: CommitmentInstallment[];
  @Prop({ enum: ['active', 'completed', 'broken', 'cancelled'], default: 'active' }) status: string;
  @Prop() notes: string;
  @Prop({ required: true }) createdBy: string;
  @Prop() brokenAt: Date;
  @Prop() brokenReason: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ type: Types.ObjectId, ref: 'Campus', default: null }) campusId: Types.ObjectId | null;
}
export const PaymentCommitmentSchema = SchemaFactory.createForClass(PaymentCommitment);
PaymentCommitmentSchema.index({ schoolSlug: 1, studentId: 1 });
PaymentCommitmentSchema.index({ schoolSlug: 1, status: 1 });
PaymentCommitmentSchema.pre('validate', function () {
  if (this.isNew && !this.commitmentNumber) {
    const y = new Date().getFullYear();
    const r = Math.floor(1000 + Math.random() * 9000);
    this.commitmentNumber = `PC-${y}-${r}`;
  }
});

// ============================================================
// DEFAULTER POLICY — per-school configurable thresholds, matching
// EDAP's emphasis on "Highly Configurable" policies rather than
// hardcoded rules.
// ============================================================

export type DefaulterPolicyDocument = DefaulterPolicy & Document;

@Schema({ timestamps: true, collection: 'defaulter_policies' })
export class DefaulterPolicy {
  @Prop({ required: true, unique: true, index: true }) schoolSlug: string;

  // Aging bucket boundaries in days overdue. Default: 0-30 / 31-60 /
  // 61-90 / 90+, matching the common convention EDAP's own deck uses.
  @Prop({ default: 30 }) agingBucket1Days: number;
  @Prop({ default: 60 }) agingBucket2Days: number;
  @Prop({ default: 90 }) agingBucket3Days: number;

  // Severity scale thresholds (days overdue) - mirrors EDAP's own
  // Minor Concern / Concern / Major Concern scale from their deck.
  @Prop({ default: 15 }) minorConcernDays: number;
  @Prop({ default: 45 }) concernDays: number;
  @Prop({ default: 75 }) majorConcernDays: number;

  // Reminder cadence - don't re-remind the same invoice more often
  // than this, regardless of how many days it stays overdue.
  @Prop({ default: 7 }) reminderThrottleDays: number;
  @Prop({ type: [String], default: ['email'] }) enabledChannels: string[]; // 'email' | 'sms' | 'whatsapp'
  @Prop({ default: true }) automatedRemindersEnabled: boolean;

  // Penalty rule - applied manually or via the bulk-penalty endpoint,
  // never automatically without a staff action triggering it.
  @Prop({ enum: ['flat', 'percentage'], default: 'flat' }) penaltyType: string;
  @Prop({ default: 0 }) penaltyAmount: number; // flat PKR amount, or % of balanceDue if penaltyType is 'percentage'
  @Prop({ default: 0 }) penaltyGraceDays: number; // no penalty before this many days overdue

  @Prop({ default: false }) disableParentAppOnMajorConcern: boolean; // matches EDAP's "Parent mobile app disabled provisions"
}
export const DefaulterPolicySchema = SchemaFactory.createForClass(DefaulterPolicy);
