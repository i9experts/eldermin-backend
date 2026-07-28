import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LeadStage = 'new' | 'contacted' | 'demo_scheduled' | 'trial' | 'converted' | 'lost';
export type LeadSource = 'onboarding_wizard' | 'contact_form' | 'manual';

@Schema({ _id: false })
export class LeadNote {
  @Prop({ required: true }) text: string;
  @Prop({ required: true }) authorName: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) authorId?: Types.ObjectId;
  @Prop({ default: () => new Date() }) createdAt: Date;
}
export const LeadNoteSchema = SchemaFactory.createForClass(LeadNote);

@Schema({ timestamps: true })
export class Lead extends Document {
  @Prop({ required: true, enum: ['onboarding_wizard', 'contact_form', 'manual'], default: 'manual' })
  source: LeadSource;

  @Prop({ required: true, enum: ['new', 'contacted', 'demo_scheduled', 'trial', 'converted', 'lost'], default: 'new', index: true })
  stage: LeadStage;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  assignedTo: Types.ObjectId | null;

  @Prop({ required: true, trim: true }) schoolName: string;
  @Prop({ trim: true }) schoolType?: string;
  @Prop({ trim: true }) country?: string;
  @Prop({ trim: true }) city?: string;

  @Prop({ required: true, trim: true }) adminName: string;
  @Prop({ required: true, trim: true, lowercase: true }) adminEmail: string;
  @Prop({ trim: true }) adminPhone?: string;
  @Prop({ trim: true }) adminRole?: string;

  @Prop() studentCount?: string;
  @Prop() staffCount?: string;
  @Prop() classCount?: string;
  @Prop() gradeRange?: string;

  @Prop({ type: [String], default: [] }) modulesRequested: string[];
  @Prop({ trim: true }) planRequested?: string;
  @Prop({ type: [String], default: [] }) integrationsRequested: string[];

  @Prop() preferredTrainingDate?: string;
  @Prop() preferredTrainingTime?: string;
  @Prop() trainingMode?: string;

  @Prop() inquiryType?: string;
  @Prop() message?: string;

  @Prop({ type: [LeadNoteSchema], default: [] }) notes: LeadNote[];
  @Prop({ type: Types.ObjectId, default: null }) convertedInstitutionId?: Types.ObjectId | null;
  @Prop({ default: null }) lastContactedAt?: Date | null;
}

export const LeadSchema = SchemaFactory.createForClass(Lead);
LeadSchema.index({ adminEmail: 1 });
LeadSchema.index({ createdAt: -1 });
