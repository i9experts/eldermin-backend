// ============================================================
// LEAD SCHEMA — Admission Lifecycle
// Eldermin ERP | NestJS + MongoDB
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LeadDocument = Lead & Document;

export type LeadSource =
  | 'website' | 'referral' | 'social_media' | 'walk_in'
  | 'phone_call' | 'education_fair' | 'advertisement' | 'agent' | 'alumni';

export type LeadStatus =
  | 'new' | 'contacted' | 'interested' | 'not_interested'
  | 'follow_up' | 'converted' | 'lost';

export type Priority = 'low' | 'medium' | 'high' | 'urgent';

@Schema({ timestamps: true, collection: 'admission_leads' })
export class Lead {
  @Prop({ required: true, trim: true })
  firstName: string;

  @Prop({ required: true, trim: true })
  lastName: string;

  @Prop({ trim: true, lowercase: true })
  email: string;

  @Prop({ required: true, trim: true })
  phone: string;

  @Prop({ required: true })
  gradeInterested: string;

  @Prop({
    required: true,
    enum: ['website','referral','social_media','walk_in','phone_call',
           'education_fair','advertisement','agent','alumni'],
  })
  source: LeadSource;

  @Prop({
    enum: ['new','contacted','interested','not_interested','follow_up','converted','lost'],
    default: 'new',
  })
  status: LeadStatus;

  @Prop({ enum: ['low','medium','high','urgent'], default: 'medium' })
  priority: Priority;

  @Prop({ trim: true })
  assignedTo: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  assignedToId: Types.ObjectId;

  @Prop({ trim: true })
  campaign: string;

  @Prop()
  campusPreference: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop()
  notes: string;

  @Prop()
  followUpDate: Date;

  @Prop()
  lastContactedAt: Date;

  @Prop({ type: Types.ObjectId, ref: 'Applicant' })
  convertedToApplicantId: Types.ObjectId;

  // Multi-tenancy
  @Prop({ required: true, index: true })
  schoolSlug: string;

  @Prop({ required: true })
  academicYear: string;

  @Prop({ default: true })
  isActive: boolean;
}

export const LeadSchema = SchemaFactory.createForClass(Lead);

// Indexes for fast queries
LeadSchema.index({ schoolSlug: 1, status: 1 });
LeadSchema.index({ schoolSlug: 1, assignedTo: 1 });
LeadSchema.index({ schoolSlug: 1, followUpDate: 1 });
LeadSchema.index({ schoolSlug: 1, createdAt: -1 });
