import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type PerformanceReviewDocument = PerformanceReview & Document;

@Schema({ timestamps: true, collection: 'performanceReviews' })
export class PerformanceReview {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Staff' }) staffId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop() staffName: string;
  @Prop() reviewPeriod: string;
  @Prop({ type: Types.ObjectId, ref: 'AcademicYear' }) academicYearId: Types.ObjectId;
  @Prop({ enum: ['mid_year','annual','probation','pip'], default: 'annual' }) reviewType: string;
  @Prop({ enum: ['draft','self_review','manager_review','completed'], default: 'draft' }) status: string;
  @Prop({
    type: [{
      category: String,
      criteria: String,
      selfScore: Number,
      managerScore: Number,
      weight: Number,
      comments: String,
      _id: false,
    }],
    default: [],
  }) criteria: any[];
  @Prop() selfOverallScore: number;
  @Prop() managerOverallScore: number;
  @Prop() finalScore: number;
  @Prop({ enum: ['outstanding','exceeds_expectations','meets_expectations','needs_improvement','unsatisfactory'] }) rating: string;
  @Prop() selfComments: string;
  @Prop() managerComments: string;
  @Prop() goals: string;
  @Prop() developmentPlan: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) reviewedBy: Types.ObjectId;
  @Prop() reviewerName: string;
  @Prop() reviewedAt: Date;
  @Prop() selfReviewedAt: Date;
}
export const PerformanceReviewSchema = SchemaFactory.createForClass(PerformanceReview);
PerformanceReviewSchema.index({ tenantId: 1, staffId: 1, academicYearId: 1 });
PerformanceReviewSchema.index({ tenantId: 1, status: 1 });
