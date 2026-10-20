import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// Generic grade ladder for an unlinked parent - they have no real Institution
// record (and often no real school on Eldermin yet) to pull a Classes &
// Sections list from like GradeLevelDropdown does elsewhere, so this is a
// fixed, school-agnostic list used only to bucket a lead's children for the
// Super Admin "primary vs secondary" filter.
export const PARENT_LEAD_GRADES = [
  'Playgroup', 'Nursery', 'KG',
  'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5',
  'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10',
  'Grade 11', 'Grade 12',
] as const;

// Primary = up to Grade 5 (and all pre-primary), Secondary = Grade 6 and up.
// Not an established cutoff anywhere else in the codebase - chosen as the
// most common primary/secondary split and only used for this filter bucket.
const SECONDARY_FROM_INDEX = PARENT_LEAD_GRADES.indexOf('Grade 6');
export function gradeBand(grade?: string | null): 'primary' | 'secondary' | 'unknown' {
  const idx = grade ? PARENT_LEAD_GRADES.indexOf(grade as any) : -1;
  if (idx === -1) return 'unknown';
  return idx < SECONDARY_FROM_INDEX ? 'primary' : 'secondary';
}

@Schema({ _id: false })
export class ParentLeadChild {
  @Prop({ required: true, trim: true }) fullName: string;
  @Prop() age?: number;
  @Prop({ trim: true }) grade?: string;
}
export const ParentLeadChildSchema = SchemaFactory.createForClass(ParentLeadChild);

@Schema({ _id: false })
export class ParentLeadLocation {
  @Prop() lat?: number;
  @Prop() lng?: number;
  @Prop({ trim: true }) country?: string;
  @Prop({ trim: true }) city?: string;
  // Closest available sub-division from the reverse-geocode response -
  // district/county/state_district or, failing that, the state/province.
  @Prop({ trim: true }) district?: string;
}
export const ParentLeadLocationSchema = SchemaFactory.createForClass(ParentLeadLocation);

export type ParentLeadDocument = ParentLead & Document;

@Schema({ timestamps: true, collection: 'parentLeads' })
export class ParentLead extends Document {
  @Prop({ required: true, trim: true }) fullName: string;
  @Prop({ required: true, trim: true, lowercase: true, unique: true, index: true }) email: string;
  @Prop({ trim: true }) phone?: string;
  @Prop({ required: true }) passwordHash: string;

  @Prop({ required: true, trim: true }) schoolNameRaw: string;
  // Ref 'OrgInstitution', not 'Institution' - that literal model name is
  // already taken by the unrelated platform-billing Institution in
  // super-admin.schema.ts (see parent-portal.module.ts for the registration
  // convention this follows).
  @Prop({ type: Types.ObjectId, ref: 'OrgInstitution', default: null, index: true })
  matchedInstitutionId: Types.ObjectId | null;

  @Prop({ type: ParentLeadLocationSchema, default: {} })
  location: ParentLeadLocation;

  @Prop({ type: [ParentLeadChildSchema], default: [] })
  children: ParentLeadChild[];

  @Prop({ required: true, default: 'parent-app-signup' })
  source: string;

  @Prop({ default: () => new Date() })
  lastLoginAt?: Date;
}

export const ParentLeadSchema = SchemaFactory.createForClass(ParentLead);
ParentLeadSchema.index({ createdAt: -1 });
ParentLeadSchema.index({ 'location.country': 1, 'location.city': 1 });
ParentLeadSchema.index({ schoolNameRaw: 1 });
