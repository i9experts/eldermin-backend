import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type StudentDocumentDocument = StudentDocument & Document;

@Schema({ timestamps: true, collection: 'studentDocuments' })
export class StudentDocument {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Student' }) studentId: Types.ObjectId;
  @Prop({ enum: ['birth_certificate','passport','national_id','previous_school_report','transfer_certificate','medical_report','vaccination_card','report_card','id_card','other'], default: 'other' }) type: string;
  @Prop({ required: true }) label: string;
  @Prop({ required: true }) s3Key: string;
  @Prop() mimeType: string;
  @Prop() fileSizeKb: number;
  @Prop({ default: false }) verified: boolean;
  @Prop() expiryDate: Date;
  @Prop({ default: false }) isVisibleToParent: boolean;
  @Prop({ type: Types.ObjectId, ref: 'User' }) uploadedBy: Types.ObjectId;
}
export const StudentDocumentSchema = SchemaFactory.createForClass(StudentDocument);
StudentDocumentSchema.index({ tenantId: 1, studentId: 1, type: 1 });
