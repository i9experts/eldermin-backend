import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CampusDocument = Campus & Document;

@Schema({ timestamps: true, collection: 'campuses' })
export class Campus {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' })
  institutionId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  code: string;

  @Prop({ default: 'main', enum: ['main','branch','boys','girls','junior','senior','other'] })
  type: string;

  @Prop()
  phone: string;

  @Prop()
  email: string;

  @Prop({
    type: { street: String, city: String, state: String, country: String, postalCode: String },
    default: {},
  })
  address: Record<string, any>;

  @Prop({ default: 0 })
  currentStudentCount: number;

  @Prop({ default: false })
  isPrimary: boolean;

  @Prop({ default: true })
  isActive: boolean;
}

export const CampusSchema = SchemaFactory.createForClass(Campus);
CampusSchema.index({ tenantId: 1, code: 1 }, { unique: true });
