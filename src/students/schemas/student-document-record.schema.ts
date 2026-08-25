// ============================================================
// STUDENT DOCUMENT RECORD — uploaded file records shown in the
// Documents tab (Student 360). Named "...Record" to avoid clashing
// with the unrelated, embedded StudentDocument_ sub-schema already
// on the Student document itself (see student.schema.ts) — that one
// backs a different, still-unused embedded `documents[]` field.
// Eldermin ERP | NestJS + MongoDB
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StudentDocumentRecordDocument = StudentDocumentRecord & Document;

@Schema({ timestamps: true, collection: 'student_document_records' })
export class StudentDocumentRecord {
  @Prop({ type: Types.ObjectId, ref: 'Student', required: true })
  studentId: Types.ObjectId;

  @Prop({
    enum: [
      'birth_certificate', 'passport', 'national_id', 'previous_school_report',
      'transfer_certificate', 'medical_report', 'vaccination_card', 'report_card',
      'id_card', 'other',
    ],
    default: 'other',
  })
  type: string;

  @Prop({ required: true }) label: string;
  @Prop({ required: true }) s3Key: string;
  @Prop() mimeType: string;
  @Prop() fileSizeKb: number;
  @Prop({ default: false }) verified: boolean;
  @Prop() expiryDate: Date;
  @Prop({ default: false }) isVisibleToParent: boolean;

  @Prop() uploadedByName: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}

export const StudentDocumentRecordSchema = SchemaFactory.createForClass(StudentDocumentRecord);
StudentDocumentRecordSchema.index({ schoolSlug: 1, studentId: 1, type: 1 });
