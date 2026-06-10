import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type JobApplicationDocument = JobApplication & Document;

@Schema({ timestamps: true, collection: 'jobApplications' })
export class JobApplication {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'JobOpening' }) jobId: Types.ObjectId;
  @Prop() jobTitle: string;
  @Prop() jobCode: string;

  @Prop() applicationNo: string;

  @Prop({ required: true }) firstName: string;
  @Prop({ required: true }) lastName: string;
  @Prop({ required: true }) email: string;
  @Prop() phone: string;
  @Prop() currentEmployer: string;
  @Prop() currentDesignation: string;
  @Prop() yearsOfExperience: number;
  @Prop() highestQualification: string;
  @Prop() expectedSalary: number;
  @Prop({ default: 'USD' }) currency: string;
  @Prop() noticePeriodDays: number;
  @Prop() availability: string;
  @Prop({ enum: ['linkedin','referral','walk_in','website','agency','job_portal','other'], default: 'website' }) source: string;
  @Prop() referredBy: string;
  @Prop() coverLetter: string;
  @Prop() resumeS3Key: string;
  @Prop() portfolioUrl: string;
  @Prop() linkedinUrl: string;

  @Prop({
    enum: ['applied','screening','shortlisted','interview','selected','offered','hired','rejected','withdrawn'],
    default: 'applied',
  }) stage: string;

  @Prop() stageChangedAt: Date;
  @Prop({
    type: [{ stage: String, movedAt: Date, note: String, movedBy: String, _id: false }],
    default: [],
  }) stageHistory: any[];

  @Prop() screeningScore: number;
  @Prop() screeningNotes: string;
  @Prop({ default: false }) isShortlisted: boolean;
  @Prop() rejectionReason: string;

  @Prop({ type: Types.ObjectId, ref: 'StaffLifecycle', default: null }) lifecycleId: Types.ObjectId;

  @Prop({ default: true }) isActive: boolean;
}

export const JobApplicationSchema = SchemaFactory.createForClass(JobApplication);
JobApplicationSchema.index({ tenantId: 1, jobId: 1, stage: 1 });
JobApplicationSchema.index({ tenantId: 1, email: 1 });
JobApplicationSchema.index({ tenantId: 1, applicationNo: 1 }, { unique: true, sparse: true });
JobApplicationSchema.index({ tenantId: 1, stage: 1 });
