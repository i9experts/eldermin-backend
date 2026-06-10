import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type EnrollmentFieldDocument = EnrollmentField & Document;

@Schema({ timestamps: true, collection: 'enrollmentFields' })
export class EnrollmentField {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ required: true }) label: string;
  @Prop({ required: true }) fieldKey: string;
  @Prop({ enum: ['text','number','date','select','multiselect','checkbox','textarea','phone','email'], default: 'text' }) fieldType: string;
  @Prop({ type: [String], default: [] }) options: string[];
  @Prop({ default: false }) isRequired: boolean;
  @Prop({ required: true }) section: string;
  @Prop({ default: 0 }) sortOrder: number;
  @Prop() placeholder: string;
  @Prop() helpText: string;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ default: false }) isSystemField: boolean;
}
export const EnrollmentFieldSchema = SchemaFactory.createForClass(EnrollmentField);
EnrollmentFieldSchema.index({ tenantId: 1, fieldKey: 1 }, { unique: true });
EnrollmentFieldSchema.index({ tenantId: 1, section: 1, sortOrder: 1 });
