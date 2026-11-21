import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type InstitutionType =
  | 'school' | 'college' | 'university' | 'coaching_centre'
  | 'technical_centre' | 'tuition_centre' | 'academy' | 'other';

export type InterestLevel = 'none' | 'curious' | 'interested' | 'demo_scheduled' | 'hot';

export type TransportStatus = 'own_fleet' | 'outsourced' | 'none';

@Schema({ _id: false })
export class FollowUpNote {
  @Prop({ required: true }) text: string;
  @Prop({ required: true }) authorName: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) authorId?: Types.ObjectId;
  @Prop({ default: () => new Date() }) createdAt: Date;
}
export const FollowUpNoteSchema = SchemaFactory.createForClass(FollowUpNote);

// Field sales reps' institution site-visit log - company-internal CRM data
// (schools/colleges/coaching centres etc. visited to pitch Eldermin and/or
// SmartVan), not scoped to any school tenant at all, same convention as
// MarketingLead (src/leads/schemas/lead.schema.ts): no tenantId, restricted
// to Super Admin. Deliberately a separate collection/module from
// MarketingLead - that one is inbound web-form leads from people who
// already found Eldermin; this is outbound rep activity on prospects who
// haven't necessarily heard of either product yet.
@Schema({ timestamps: true, collection: 'sales_visit_records' })
export class VisitRecord extends Document {
  // ── Who visited / when ──────────────────────────────────────────────
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  visitedBy: Types.ObjectId;

  @Prop({ trim: true }) visitedByName?: string;
  @Prop({ required: true, default: () => new Date() }) visitDate: Date;

  // ── Institution identity ────────────────────────────────────────────
  @Prop({ required: true, trim: true }) institutionName: string;
  @Prop({ required: true, enum: ['school', 'college', 'university', 'coaching_centre', 'technical_centre', 'tuition_centre', 'academy', 'other'] })
  institutionType: InstitutionType;
  @Prop({ trim: true }) city?: string;
  @Prop({ trim: true }) area?: string;

  @Prop({ type: { lat: Number, lng: Number, accuracyMeters: Number }, default: null })
  location?: { lat: number; lng: number; accuracyMeters?: number } | null;

  @Prop() photoUrl?: string;

  // ── Profile ──────────────────────────────────────────────────────────
  @Prop({ enum: ['budget', 'mid', 'premium'] }) feeTier?: string;
  @Prop({ enum: ['single', '2_3', '4_plus'] }) campusCount?: string;
  @Prop({ enum: ['under_50', '50_200', '200_500', '500_1000', '1000_plus'] }) studentCount?: string;
  @Prop({ enum: ['under_10', '10_30', '30_60', '60_plus'] }) staffCount?: string;

  // ── Contact ──────────────────────────────────────────────────────────
  @Prop({ trim: true }) contactName?: string;
  @Prop({ enum: ['owner', 'principal', 'admin', 'coordinator', 'teacher', 'other'] }) contactRole?: string;
  @Prop({ trim: true }) whatsapp?: string;
  @Prop({ type: Boolean, default: null }) whatsappOk?: boolean | null;
  @Prop({ type: [String], default: [] }) bestTimeToContact: string[];
  @Prop({ trim: true }) email?: string;
  @Prop({ trim: true }) socialOrWebsite?: string;

  // ── Current setup (lead-qualification signal) ───────────────────────
  @Prop({ enum: ['manual_register', 'excel', 'software', 'none'] }) currentSystem?: string;
  @Prop({ trim: true }) currentSystemName?: string;
  @Prop({ enum: ['own_fleet', 'outsourced', 'none'] }) transportStatus?: TransportStatus;
  @Prop({ enum: ['none', 'manual_calls', 'gps_app', 'other'] }) transportTrackingMethod?: string;
  @Prop({ enum: ['informal', 'structured', 'none'] }) feeConcessionPlans?: string;
  @Prop({ type: [String], default: [] }) admissionSeasons: string[];

  // ── Interest / pitch outcome ─────────────────────────────────────────
  @Prop({ required: true, enum: ['none', 'curious', 'interested', 'demo_scheduled', 'hot'], default: 'curious' })
  elderminInterest: InterestLevel;
  @Prop({ required: true, enum: ['none', 'curious', 'interested', 'demo_scheduled', 'hot'], default: 'none' })
  smartvanInterest: InterestLevel;

  @Prop({ trim: true }) biggestProblem?: string;
  @Prop({ trim: true }) notes?: string;
  @Prop({ type: Date, default: null }) nextFollowUpDate?: Date | null;
  @Prop({ default: false }) followUpDone: boolean;
  @Prop({ type: [FollowUpNoteSchema], default: [] }) followUpNotes: FollowUpNote[];
}

export const VisitRecordSchema = SchemaFactory.createForClass(VisitRecord);
VisitRecordSchema.index({ visitDate: -1 });
VisitRecordSchema.index({ elderminInterest: 1, smartvanInterest: 1 });
VisitRecordSchema.index({ nextFollowUpDate: 1 });
