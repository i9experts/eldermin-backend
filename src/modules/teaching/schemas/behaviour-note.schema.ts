import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type BehaviourNoteDocument = BehaviourNote & Document;

@Schema({ timestamps: true, collection: 'behaviourNotes' })
export class BehaviourNote {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Student' }) studentId: Types.ObjectId;
  @Prop() studentName: string;
  @Prop() admissionNo: string;
  @Prop() gradeLevel: string;
  @Prop() sectionName: string;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Staff' }) reportedBy: Types.ObjectId;
  @Prop() reportedByName: string;
  // Denormalized from the reporting staff member's own campus at
  // creation time.
  @Prop({ type: Types.ObjectId, ref: 'Campus', default: null }) campusId: Types.ObjectId | null;
  @Prop({ required: true }) incidentDate: Date;
  @Prop({ enum: ['positive', 'concern', 'serious', 'resolved'], default: 'concern' }) type: string;
  @Prop({ required: true }) note: string;
  @Prop() actionTaken: string;
  @Prop({ default: false }) parentNotified: boolean;
  @Prop() parentNotifiedAt: Date;
  @Prop({ default: false }) followUpRequired: boolean;
  @Prop() followUpDate: Date;
  @Prop({ default: false }) isResolved: boolean;
}

export const BehaviourNoteSchema = SchemaFactory.createForClass(BehaviourNote);
BehaviourNoteSchema.index({ tenantId: 1, studentId: 1, incidentDate: -1 });
BehaviourNoteSchema.index({ tenantId: 1, gradeLevel: 1, type: 1 });
