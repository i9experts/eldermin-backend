import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type MedicalRecordDocument = MedicalRecord & Document;

@Schema({ timestamps: true, collection: 'medicalRecords' })
export class MedicalRecord {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Student', unique: true }) studentId: Types.ObjectId;
  @Prop({ enum: ['A+','A-','B+','B-','O+','O-','AB+','AB-','unknown'], default: 'unknown' }) bloodGroup: string;
  @Prop({ type: [{ type: String, name: String, severity: String, reaction: String, treatment: String, _id: false }], default: [] }) allergies: any[];
  @Prop({ type: [{ name: String, severity: String, managementPlan: String, emergencyProtocol: String, _id: false }], default: [] }) conditions: any[];
  @Prop({ type: [{ name: String, dosage: String, frequency: String, keptAt: String, isActive: Boolean, _id: false }], default: [] }) medications: any[];
  @Prop({ type: { hasDyslexia: Boolean, hasADHD: Boolean, hasASD: Boolean, iepExists: Boolean, accommodations: [String] }, default: {} }) learningSupport: any;
  @Prop() emergencyAction: string;
  @Prop({ type: { name: String, phone: String, clinic: String }, default: {} }) familyDoctor: any;
  @Prop() notes: string;
}
export const MedicalRecordSchema = SchemaFactory.createForClass(MedicalRecord);
MedicalRecordSchema.index({ tenantId: 1, studentId: 1 }, { unique: true });
