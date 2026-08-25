// ============================================================
// STUDENT MEDICAL RECORD — Health tab (Student 360)
// Eldermin ERP | NestJS + MongoDB
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MedicalRecordDocument = MedicalRecord & Document;

@Schema({ timestamps: true, collection: 'student_medical_records' })
export class MedicalRecord {
  @Prop({ type: Types.ObjectId, ref: 'Student', required: true })
  studentId: Types.ObjectId;

  @Prop({ enum: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-', 'unknown'], default: 'unknown' })
  bloodGroup: string;

  @Prop({ type: [{ name: String, type: String, severity: String, treatment: String, _id: false }], default: [] })
  allergies: any[];

  @Prop({ type: [{ name: String, severity: String, emergencyProtocol: String, _id: false }], default: [] })
  conditions: any[];

  @Prop({ type: [{ name: String, dosage: String, frequency: String, keptAt: String, _id: false }], default: [] })
  medications: any[];

  @Prop() emergencyAction: string;
  @Prop() peRestrictions: string;
  @Prop() dietaryRestrictions: string;
  @Prop({ type: { name: String, phone: String, clinic: String }, default: {} }) familyDoctor: any;
  @Prop() notes: string;

  @Prop({ required: true, index: true }) schoolSlug: string;
}

export const MedicalRecordSchema = SchemaFactory.createForClass(MedicalRecord);
MedicalRecordSchema.index({ schoolSlug: 1, studentId: 1 }, { unique: true });
