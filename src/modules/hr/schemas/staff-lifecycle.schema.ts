import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type StaffLifecycleDocument = StaffLifecycle & Document;

@Schema({ timestamps: true, collection: 'staffLifecycle' })
export class StaffLifecycle {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' })
  institutionId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Campus', default: null })
  campusId: Types.ObjectId;

  // Candidate identity
  @Prop({ required: true }) firstName: string;
  @Prop({ required: true }) lastName: string;
  @Prop() email: string;
  @Prop() phone: string;
  @Prop() photoUrl: string;

  // Position applied for
  @Prop({ required: true }) positionTitle: string;
  @Prop() department: string;
  @Prop({ enum: ['full_time','part_time','contract','visiting'], default: 'full_time' })
  employmentType: string;
  @Prop() expectedSalary: number;
  @Prop({ default: 'USD' }) currency: string;

  // Current pipeline stage
  @Prop({
    required: true,
    enum: ['candidate','interview','selected','offered','onboarding','active','exit','rejected','withdrawn'],
    default: 'candidate',
  })
  stage: string;

  @Prop() stageChangedAt: Date;
  @Prop({ type: Types.ObjectId, ref: 'User' }) stageChangedBy: Types.ObjectId;

  // Stage history (every move through pipeline)
  @Prop({
    type: [{
      stage: String,
      movedAt: Date,
      movedBy: { type: Types.ObjectId, ref: 'User' },
      note: String,
      _id: false,
    }],
    default: [],
  })
  stageHistory: any[];

  // Application details
  @Prop() applicationDate: Date;
  @Prop() resumeS3Key: string;
  @Prop() coverLetterS3Key: string;
  @Prop() source: string;
  @Prop() referredBy: string;
  @Prop() yearsOfExperience: number;
  @Prop() highestQualification: string;
  @Prop() currentEmployer: string;
  @Prop() noticePeriodDays: number;
  @Prop() availability: string;
  @Prop() notes: string;

  // Interview details
  @Prop({
    type: [{
      round: Number,
      scheduledAt: Date,
      venue: String,
      interviewers: [String],
      type: String,
      status: String,
      feedback: String,
      rating: Number,
      recommendation: String,
      _id: false,
    }],
    default: [],
  })
  interviews: any[];

  // Offer details
  @Prop({
    type: {
      offeredSalary: Number,
      currency: String,
      designation: String,
      department: String,
      joiningDate: Date,
      offerLetterS3Key: String,
      offerDate: Date,
      expiryDate: Date,
      status: String,
      candidateResponse: String,
      respondedAt: Date,
    },
    default: null,
  })
  offer: any;

  // Onboarding checklist
  @Prop({
    type: [{
      task: String,
      category: String,
      isDone: Boolean,
      doneAt: Date,
      doneBy: String,
      _id: false,
    }],
    default: [],
  })
  onboardingChecklist: any[];

  // Exit details (if stage = exit)
  @Prop({
    type: {
      exitType: String,
      exitDate: Date,
      lastWorkingDay: Date,
      reason: String,
      noticePeriodServed: Boolean,
      clearanceStatus: String,
      exitInterviewDone: Boolean,
      exitInterviewNotes: String,
      finalSettlementAmount: Number,
      finalSettlementDate: Date,
    },
    default: null,
  })
  exitDetails: any;

  // Linked staff record (set when candidate is hired and moves to active)
  @Prop({ type: Types.ObjectId, ref: 'Staff', default: null })
  staffId: Types.ObjectId;

  @Prop({ default: true }) isActive: boolean;
}

export const StaffLifecycleSchema = SchemaFactory.createForClass(StaffLifecycle);
StaffLifecycleSchema.index({ tenantId: 1, stage: 1 });
StaffLifecycleSchema.index({ tenantId: 1, email: 1 }, { sparse: true });
StaffLifecycleSchema.index({ tenantId: 1, createdAt: -1 });
