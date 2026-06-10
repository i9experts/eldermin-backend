import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AcademicYearDocument = AcademicYear & Document;

@Schema({ timestamps: true, collection: 'academicYears' })
export class AcademicYear {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' })
  institutionId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  code: string;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  @Prop({ default: 'upcoming', enum: ['upcoming','active','completed','archived'] })
  status: string;

  @Prop({ default: false })
  isCurrent: boolean;
}

export const AcademicYearSchema = SchemaFactory.createForClass(AcademicYear);
AcademicYearSchema.index({ tenantId: 1, code: 1 }, { unique: true });
AcademicYearSchema.index({ institutionId: 1, isCurrent: 1 }, { unique: true, partialFilterExpression: { isCurrent: true } });
