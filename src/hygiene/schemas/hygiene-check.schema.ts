// ============================================================
// HYGIENE CHECK — daily teacher/staff grooming observation, feeding
// the Parent Engagement Score's hygiene dimension. Booleans, not a
// 1-5 scale: a teacher checking 30 students in a few minutes at
// morning assembly needs a fast yes/no per item, not a graded scale
// per item — compliance rate across items is what the score needs,
// not finer-grained severity.
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type HygieneCheckDocument = HygieneCheck & Document;

@Schema({ _id: false })
class HygieneItems {
  @Prop({ default: true }) uniform: boolean;
  @Prop({ default: true }) capOrScarf: boolean;
  @Prop({ default: true }) shoes: boolean;
  @Prop({ default: true }) lunchBrought: boolean;
}
const HygieneItemsSchema = SchemaFactory.createForClass(HygieneItems);

@Schema({ timestamps: true, collection: 'hygiene_checks' })
export class HygieneCheck {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Student', index: true }) studentId: Types.ObjectId;
  @Prop({ required: true }) studentName: string;
  @Prop({ required: true }) grade: string;
  @Prop() section: string;
  @Prop({ type: Types.ObjectId, ref: 'Campus', default: null }) campusId: Types.ObjectId | null;
  @Prop({ required: true }) date: Date; // same per-day convention as StudentAttendance/PickupLog

  @Prop({ type: HygieneItemsSchema, default: () => ({}) }) items: HygieneItems;
  @Prop() notes: string;

  @Prop({ required: true }) checkedBy: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) checkedByUserId: Types.ObjectId;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const HygieneCheckSchema = SchemaFactory.createForClass(HygieneCheck);
HygieneCheckSchema.index({ schoolSlug: 1, studentId: 1, date: 1 }, { unique: true });
HygieneCheckSchema.index({ schoolSlug: 1, grade: 1, section: 1, date: 1 });
