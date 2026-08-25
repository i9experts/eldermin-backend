// ============================================================
// STUDENT ENROLLMENT FIELD — per-school custom fields shown in the
// enrollment wizard (Step 7 "Services") and the admin's
// "Manage Enrollment Fields" panel.
// Eldermin ERP | NestJS + MongoDB
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type EnrollmentFieldDocument = EnrollmentField & Document;

@Schema({ timestamps: true, collection: 'student_enrollment_fields' })
export class EnrollmentField {
  @Prop({ required: true }) label: string;
  @Prop({ required: true }) fieldKey: string;

  @Prop({
    enum: ['text', 'number', 'date', 'select', 'multiselect', 'checkbox', 'textarea', 'phone', 'email'],
    default: 'text',
  })
  fieldType: string;

  @Prop({ type: [String], default: [] }) options: string[];
  @Prop({ default: false }) isRequired: boolean;

  @Prop({
    enum: ['personal', 'admission', 'health', 'services', 'other'],
    default: 'other',
  })
  section: string;

  @Prop({ default: 0 }) sortOrder: number;
  @Prop() placeholder: string;
  @Prop() helpText: string;

  // System fields ship with the platform and can't be edited/deleted by a school.
  @Prop({ default: false }) isSystemField: boolean;

  @Prop({ required: true, index: true }) schoolSlug: string;
}

export const EnrollmentFieldSchema = SchemaFactory.createForClass(EnrollmentField);
EnrollmentFieldSchema.index({ schoolSlug: 1, fieldKey: 1 }, { unique: true });
EnrollmentFieldSchema.index({ schoolSlug: 1, section: 1, sortOrder: 1 });
