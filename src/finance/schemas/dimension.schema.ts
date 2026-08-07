// ============================================================
// ACCOUNTING DIMENSIONS — Eldermin ERP | NestJS + MongoDB
// Phase 8 of the Odoo-standard finance rebuild: a generalized tagging
// framework beyond Cost Center. Cost Center shipped in Phase 1 as the
// first, most-needed dimension and remains the first-class, most-used
// dimension on every JournalLine (costCenterId/costCenterName) — this file
// adds an ADDITIVE, optional second layer for future dimension types
// (Grant, Project, Funding Source, ...) that a school can define for
// itself without any backend schema change. A school that never touches
// this feature sees zero behavior change: JournalLine.dimensions defaults
// to an empty array and no report depends on it existing.
// See claude/finance-module-odoo-standard-build-plan.md.
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ============================================================
// ACCOUNTING DIMENSION — the dimension TYPE definition, e.g. "Grant",
// "Project", "Funding Source".
// ============================================================
export type AccountingDimensionDocument = AccountingDimension & Document;

@Schema({ timestamps: true, collection: 'accounting_dimensions' })
export class AccountingDimension {
  @Prop({ required: true }) name: string;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const AccountingDimensionSchema = SchemaFactory.createForClass(AccountingDimension);
AccountingDimensionSchema.index({ schoolSlug: 1, name: 1 }, { unique: true });

// ============================================================
// DIMENSION VALUE — a specific value within a dimension, e.g. the "Grant"
// dimension might have values "USAID-2026", "Local Donor Fund".
// ============================================================
export type DimensionValueDocument = DimensionValue & Document;

@Schema({ timestamps: true, collection: 'dimension_values' })
export class DimensionValue {
  @Prop({ type: Types.ObjectId, ref: 'AccountingDimension', required: true }) dimensionId: Types.ObjectId;
  @Prop({ required: true }) code: string;
  @Prop({ required: true }) name: string;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const DimensionValueSchema = SchemaFactory.createForClass(DimensionValue);
DimensionValueSchema.index({ schoolSlug: 1, dimensionId: 1, code: 1 }, { unique: true });
