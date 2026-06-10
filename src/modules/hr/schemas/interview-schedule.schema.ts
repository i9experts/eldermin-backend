import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type InterviewScheduleDocument = InterviewSchedule & Document;

@Schema({ timestamps: true, collection: 'interviewSchedules' })
export class InterviewSchedule {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'JobOpening' }) jobId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'JobApplication' }) applicationId: Types.ObjectId;

  @Prop() candidateName: string;
  @Prop() jobTitle: string;
  @Prop() jobCode: string;

  @Prop({ default: 1 }) round: number;
  @Prop({ enum: ['phone','video','in_person','technical','hr','panel'], default: 'in_person' }) type: string;
  @Prop({ required: true }) scheduledAt: Date;
  @Prop({ default: 60 }) durationMins: number;
  @Prop() venue: string;
  @Prop() meetingLink: string;
  @Prop({ type: [String], default: [] }) interviewers: string[];
  @Prop() panelLead: string;

  @Prop({ enum: ['scheduled','completed','cancelled','no_show','rescheduled'], default: 'scheduled' }) status: string;

  @Prop() technicalRating: number;
  @Prop() communicationRating: number;
  @Prop() attitudeRating: number;
  @Prop() overallRating: number;
  @Prop({ enum: ['strongly_hire','hire','hold','no_hire','reject'], default: null }) recommendation: string;
  @Prop() feedback: string;
  @Prop() strengths: string;
  @Prop() weaknesses: string;
  @Prop() feedbackSubmittedAt: Date;
  @Prop() feedbackSubmittedBy: string;

  @Prop() notes: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) scheduledBy: Types.ObjectId;
}

export const InterviewScheduleSchema = SchemaFactory.createForClass(InterviewSchedule);
InterviewScheduleSchema.index({ tenantId: 1, scheduledAt: 1 });
InterviewScheduleSchema.index({ tenantId: 1, applicationId: 1 });
InterviewScheduleSchema.index({ tenantId: 1, jobId: 1 });
InterviewScheduleSchema.index({ tenantId: 1, status: 1, scheduledAt: 1 });
