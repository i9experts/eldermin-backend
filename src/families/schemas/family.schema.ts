// ============================================================
// FAMILY SCHEMA — Household grouping with explicit Family Code (F.Code)
// Eldermin ERP | NestJS + MongoDB
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FamilyDocument = Family & Document;

@Schema({ timestamps: true, collection: 'families' })
export class Family {
  @Prop({ required: true }) familyCode: string; // e.g. FAM-0001

  @Prop() primaryGuardianName: string;
  @Prop() phone: string;
  @Prop() alternatePhone: string;
  @Prop() email: string;
  @Prop() address: string;

  @Prop({ type: [Types.ObjectId], ref: 'Student', default: [] })
  studentIds: Types.ObjectId[];

  @Prop({
    enum: ['manual', 'retrofit-phone', 'retrofit-lastname'],
    default: 'manual',
  })
  source: string;

  // Retrofit-created families start unverified — an admin must review and confirm
  // that students grouped by heuristic (phone match, lastname match) are a real family
  @Prop({ default: true }) verified: boolean;

  @Prop() notes: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}

export const FamilySchema = SchemaFactory.createForClass(Family);
FamilySchema.index({ schoolSlug: 1, familyCode: 1 }, { unique: true });
FamilySchema.index({ schoolSlug: 1, phone: 1 });
FamilySchema.index({ schoolSlug: 1, verified: 1 });
