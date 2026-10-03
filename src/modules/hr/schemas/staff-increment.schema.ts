import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StaffIncrementDocument = StaffIncrement & Document;

// A single salary-raise event for a staff member - the Increment List
// report is just this collection filtered/sorted. Deliberately a standalone
// audit record (never rewrites Staff.salary retroactively for past periods)
// so "what was this person earning in March" stays answerable even after
// a later raise. Applying an increment DOES update Staff.salary going
// forward - see HrService.createIncrement.
@Schema({ timestamps: true, collection: 'hr_staff_increments' })
export class StaffIncrement {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ required: true, index: true }) schoolSlug: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Staff', index: true }) staffId: Types.ObjectId;
  @Prop() staffName: string;
  @Prop() employeeId: string;
  @Prop() designation: string;
  @Prop() department: string;
  @Prop() campus: string;

  @Prop({ required: true }) effectiveDate: Date;
  @Prop({ required: true }) previousSalary: number;
  @Prop({ required: true }) newSalary: number;
  // Both stored (not derived at read time) so a report is a straight sort/
  // filter over the collection, not a recompute - and so the numbers stay
  // correct even if later changes alter how the percentage would be
  // calculated today.
  @Prop({ required: true }) incrementAmount: number;
  @Prop({ required: true }) incrementPercent: number;

  @Prop({
    enum: ['annual_review', 'promotion', 'market_adjustment', 'performance', 'cost_of_living', 'other'],
    default: 'annual_review',
  })
  reason: string;
  @Prop() notes: string;
  @Prop() performanceReviewId: Types.ObjectId;

  @Prop() approvedBy: string;
  @Prop() createdBy: string;
}

export const StaffIncrementSchema = SchemaFactory.createForClass(StaffIncrement);
StaffIncrementSchema.index({ schoolSlug: 1, staffId: 1, effectiveDate: -1 });
StaffIncrementSchema.index({ schoolSlug: 1, effectiveDate: -1 });
