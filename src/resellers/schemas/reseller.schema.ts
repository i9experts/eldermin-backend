// ============================================================
// RESELLER — Eldermin Partner Network (Phase 1)
// NestJS + MongoDB
//
// A Reseller sits one level above Institution in the tenant hierarchy
// (Eldermin -> Reseller -> Institution -> Campus), mirroring the same
// "plain scoping id on the child" convention already used throughout
// the app (Campus.schoolSlug, CampusRoom.buildingId, etc.) - here it's
// Institution.resellerId (see super-admin.schema.ts) pointing back at
// this collection.
//
// Track A (commission) vs Track B (wholesale) and the three tiers
// (certified_partner / regional_partner / master_distributor) follow
// the "Eldermin Partner Network" plan: commissionRateYear1/Renewal
// apply to Track A; wholesaleDiscount applies to Track B. Both fields
// exist on every reseller so a partner can be reviewed for conversion
// from A to B without a schema migration.
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ _id: false })
class ResellerContact {
  @Prop() name: string;
  @Prop({ lowercase: true, trim: true }) email: string;
  @Prop() phone: string;
  @Prop() designation: string;
}

export type ResellerDocument = Reseller & Document;

@Schema({ timestamps: true, collection: 'resellers' })
export class Reseller {
  @Prop({ required: true }) name: string;
  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  slug: string;

  @Prop({
    enum: ['certified_partner', 'regional_partner', 'master_distributor'],
    default: 'certified_partner',
    index: true,
  })
  tier: string;

  // Track A = commission (Eldermin bills the school). Track B = wholesale
  // (the reseller bills the school directly). Set from the tier's default
  // at creation but editable — a Certified Partner can request Track B.
  @Prop({ enum: ['A', 'B'], default: 'A' })
  track: string;

  @Prop({
    enum: ['pending', 'active', 'suspended', 'terminated'],
    default: 'pending',
    index: true,
  })
  status: string;

  // Territory
  @Prop() territoryCountry: string;
  @Prop() territoryRegion: string; // city/region label, free text
  @Prop({ default: false }) territoryExclusive: boolean; // only meaningful at master_distributor

  // Contacts / company
  @Prop({ type: ResellerContact, default: {} }) primaryContact: ResellerContact;
  @Prop() companyName: string;
  @Prop() companyRegistrationNumber: string;
  @Prop() website: string;
  @Prop() notes: string;

  // Commercial terms — seeded from tier defaults, editable per partner
  @Prop({ default: 20 }) commissionRateYear1: number; // % of collected revenue, Track A
  @Prop({ default: 0 }) commissionRateRenewal: number; // % renewal, Track A
  @Prop({ default: 0 }) wholesaleDiscount: number; // % off list price, Track B

  // Quota to HOLD this tier (a floor, not a provisioning cap)
  @Prop({ default: 0 }) quotaInstitutions: number;
  @Prop({ default: 12 }) quotaWindowMonths: number;

  // Lifecycle
  @Prop({ default: false }) certificationComplete: boolean;
  @Prop() agreementSignedAt: Date;
  @Prop() approvedBy: string;
  @Prop() approvedAt: Date;
  @Prop() suspendedReason: string;
  @Prop() suspendedAt: Date;
  @Prop() terminatedReason: string;
  @Prop() terminatedAt: Date;
}

export const ResellerSchema = SchemaFactory.createForClass(Reseller);
ResellerSchema.index({ status: 1, tier: 1 });
ResellerSchema.index({ territoryCountry: 1 });
