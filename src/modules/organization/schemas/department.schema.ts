import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type DepartmentDocument = Department & Document;

@Schema({ timestamps: true, collection: 'departments' })
export class Department {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' })
  institutionId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Campus', default: null })
  campusId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  code: string;

  @Prop({ enum: ['academic', 'administrative', 'support', 'operations'], default: 'academic' })
  type: string;

  @Prop({ type: Types.ObjectId, ref: 'Staff', default: null })
  headId: Types.ObjectId;

  @Prop()
  description: string;

  @Prop({ default: true })
  isActive: boolean;
}

export const DepartmentSchema = SchemaFactory.createForClass(Department);
DepartmentSchema.index({ tenantId: 1, code: 1 }, { unique: true });
