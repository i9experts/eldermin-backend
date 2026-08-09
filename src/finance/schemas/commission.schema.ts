// ============================================================
// SALES COMMISSION — Phase 7 report suite.
//
// This app is a school ERP, not a sales organization, so there is no
// pre-existing "sales partner" concept anywhere in the codebase (verified —
// no commission/referral-agent tracking exists in students, families, or
// admissions beyond a free-text admissions-lead "source" enum). Rather than
// fabricate a whole commission-tracking subsystem with invented data, this
// models the honest minimal version: a free-text "referral source" tag
// (an agent, consultancy, or individual who referred a family to the
// school) with a configurable commission rate, and an explicit assignment
// of which family/student came in through which referral source. Until a
// school configures both a rule and at least one assignment, the resulting
// report (FinanceService.getSalesCommissionReport) is correctly empty —
// no invented numbers.
//
// Deliberately kept as its own schema file, independent of the
// Student/Family schemas, so Phase 7 doesn't need to touch those modules.
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SalesCommissionRuleDocument = SalesCommissionRule & Document;

@Schema({ timestamps: true, collection: 'sales_commission_rules' })
export class SalesCommissionRule {
  @Prop({ required: true }) referralSourceName: string; // free-text tag, e.g. "Ahmed Khan (Agent)" or "XYZ Consultancy"
  @Prop({ enum: ['percent', 'flat'], default: 'percent' }) rateType: string;
  // percent: % of fee actually collected from assigned students/families in the period.
  // flat: fixed amount per payment collected from an assigned student/family.
  @Prop({ required: true }) rateValue: number;
  @Prop() notes: string;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const SalesCommissionRuleSchema = SchemaFactory.createForClass(SalesCommissionRule);
SalesCommissionRuleSchema.index({ schoolSlug: 1, referralSourceName: 1 }, { unique: true });

export type CommissionAssignmentDocument = CommissionAssignment & Document;

@Schema({ timestamps: true, collection: 'sales_commission_assignments' })
export class CommissionAssignment {
  @Prop({ enum: ['family', 'student'], required: true }) targetType: string;
  @Prop({ required: true }) targetId: string; // Family._id or Student._id as a string — kept loosely typed on purpose, see file header
  @Prop({ required: true }) targetLabel: string; // denormalized name/family code for display, same pattern as Invoice.studentName
  @Prop({ required: true }) referralSourceName: string; // matches SalesCommissionRule.referralSourceName
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const CommissionAssignmentSchema = SchemaFactory.createForClass(CommissionAssignment);
CommissionAssignmentSchema.index({ schoolSlug: 1, targetType: 1, targetId: 1 }, { unique: true });
