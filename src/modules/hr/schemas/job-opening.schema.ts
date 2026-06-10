import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type JobOpeningDocument = JobOpening & Document;

@Schema({ timestamps: true, collection: 'jobOpenings' })
export class JobOpening {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Campus', default: null }) campusId: Types.ObjectId;
  @Prop() campusName: string;

  @Prop({ required: true }) jobCode: string;
  @Prop({ required: true }) title: string;
  @Prop({ required: true }) department: string;
  @Prop({ enum: ['permanent','contract','part_time','visiting','temporary'], default: 'permanent' }) type: string;
  @Prop({ default: 1 }) vacancies: number;
  @Prop({ enum: ['entry','mid','senior','lead','head','executive'], default: 'mid' }) level: string;

  @Prop() description: string;
  @Prop({ type: [String], default: [] }) responsibilities: string[];
  @Prop({ type: [String], default: [] }) requirements: string[];
  @Prop({ type: [String], default: [] }) qualifications: string[];
  @Prop({ type: [String], default: [] }) skills: string[];
  @Prop({ type: [String], default: [] }) benefits: string[];

  @Prop() minSalary: number;
  @Prop() maxSalary: number;
  @Prop({ default: 'USD' }) currency: string;
  @Prop({ default: false }) showSalary: boolean;

  @Prop() applicationDeadline: Date;
  @Prop() expectedJoiningDate: Date;

  @Prop({ enum: ['draft','active','paused','closed','filled','cancelled'], default: 'draft' }) status: string;
  @Prop({ default: false }) isUrgent: boolean;
  @Prop({ default: false }) isPublished: boolean;

  @Prop({ default: 0 }) applicationsCount: number;
  @Prop({ default: 0 }) shortlistedCount: number;

  @Prop({ type: Types.ObjectId, ref: 'User' }) createdBy: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User' }) hiringManager: Types.ObjectId;
  @Prop() hiringManagerName: string;
}

export const JobOpeningSchema = SchemaFactory.createForClass(JobOpening);
JobOpeningSchema.index({ tenantId: 1, status: 1 });
JobOpeningSchema.index({ tenantId: 1, jobCode: 1 }, { unique: true });
JobOpeningSchema.index({ tenantId: 1, applicationDeadline: 1 });
