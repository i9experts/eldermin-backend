import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ============================================================
// CONSENT — parent-facing digital consent records
// ============================================================
// Real records of what a school asked consent for and how a guardian
// responded, not a static checkbox with no persistence. A ConsentRequest
// is created by the school (e.g. "Field trip to the museum"); each
// linked guardian gets a ConsentResponse they can grant or decline from
// the app, with a timestamp - an actual audit trail, since consent
// without a record of who agreed and when isn't really consent.
// ============================================================

export type ConsentRequestDocument = ConsentRequest & Document;

@Schema({ timestamps: true, collection: 'consent_requests' })
export class ConsentRequest {
  @Prop({ required: true }) title: string;
  @Prop({ required: true }) description: string;
  @Prop({ enum: ['field_trip', 'medical', 'photo_video', 'data_sharing', 'other'], default: 'other' }) category: string;
  @Prop() dueDate: Date;
  @Prop({ type: [Types.ObjectId], ref: 'Student', default: [] }) studentIds: Types.ObjectId[];
  @Prop({ required: true }) createdBy: string;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const ConsentRequestSchema = SchemaFactory.createForClass(ConsentRequest);
ConsentRequestSchema.index({ schoolSlug: 1, isActive: 1 });

export type ConsentResponseDocument = ConsentResponse & Document;

@Schema({ timestamps: true, collection: 'consent_responses' })
export class ConsentResponse {
  @Prop({ required: true, type: Types.ObjectId, ref: 'ConsentRequest' }) consentRequestId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Student' }) studentId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' }) respondedByUserId: Types.ObjectId;
  @Prop({ required: true }) respondedByName: string;
  @Prop({ enum: ['granted', 'declined'], required: true }) decision: string;
  @Prop() notes: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const ConsentResponseSchema = SchemaFactory.createForClass(ConsentResponse);
ConsentResponseSchema.index({ schoolSlug: 1, consentRequestId: 1, studentId: 1 }, { unique: true });

// ============================================================
// STUDENT LEAVE — a guardian informing the school their child will be
// absent, distinct from Staff LeaveApplication (different model, same
// underlying idea of a real approval workflow rather than a note).
// ============================================================

export type StudentLeaveDocument = StudentLeave & Document;

@Schema({ timestamps: true, collection: 'student_leaves' })
export class StudentLeave {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Student' }) studentId: Types.ObjectId;
  @Prop({ required: true }) studentName: string;
  @Prop({ required: true }) fromDate: Date;
  @Prop({ required: true }) toDate: Date;
  @Prop({ required: true }) reason: string;
  @Prop({ enum: ['sick', 'family', 'travel', 'other'], default: 'other' }) leaveType: string;
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' }) requestedByUserId: Types.ObjectId;
  @Prop({ required: true }) requestedByName: string;
  @Prop({ enum: ['pending', 'approved', 'rejected'], default: 'pending' }) status: string;
  @Prop() approverName: string;
  @Prop() approverNote: string;
  @Prop() approvedAt: Date;
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ type: Types.ObjectId, ref: 'Campus', default: null }) campusId: Types.ObjectId | null;
}
export const StudentLeaveSchema = SchemaFactory.createForClass(StudentLeave);
StudentLeaveSchema.index({ schoolSlug: 1, studentId: 1, fromDate: -1 });
StudentLeaveSchema.index({ schoolSlug: 1, status: 1 });
