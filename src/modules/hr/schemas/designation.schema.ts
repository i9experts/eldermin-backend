import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type DesignationDocument = Designation & Document;

@Schema({ timestamps: true, collection: 'designations' })
export class Designation {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' })
  tenantId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  code: string;

  @Prop()
  department: string;

  @Prop({ default: 1 })
  level: number;

  @Prop({ default: true })
  isActive: boolean;
}

export const DesignationSchema = SchemaFactory.createForClass(Designation);
DesignationSchema.index({ tenantId: 1, code: 1 }, { unique: true });
