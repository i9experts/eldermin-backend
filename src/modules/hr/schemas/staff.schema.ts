import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StaffDocument = Staff & Document;

@Schema({ timestamps: true, collection: 'staff' })
export class Staff {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Institution' })
  institutionId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Campus' })
  campusId: Types.ObjectId;

  @Prop({ required: true })
  employeeId: string;

  @Prop({ required: true })
  firstName: string;

  @Prop({ required: true })
  lastName: string;

  @Prop()
  email: string;

  @Prop()
  phone: string;

  @Prop({ enum: ['male', 'female', 'other'] })
  gender: string;

  @Prop()
  dateOfBirth: Date;

  @Prop()
  dateOfJoining: Date;

  @Prop({ type: Types.ObjectId, ref: 'Designation' })
  designationId: Types.ObjectId;

  @Prop()
  department: string;

  @Prop({
    enum: ['full_time', 'part_time', 'contract', 'volunteer'],
    default: 'full_time',
  })
  employmentType: string;

  @Prop({ default: 0 })
  salary: number;

  @Prop()
  avatarUrl: string;

  @Prop({
    type: { street: String, city: String, state: String, country: String, postalCode: String },
    default: {},
  })
  address: Record<string, any>;

  @Prop({
    enum: ['active', 'on_leave', 'resigned', 'terminated'],
    default: 'active',
  })
  status: string;

  @Prop({ default: true })
  isActive: boolean;
}

export const StaffSchema = SchemaFactory.createForClass(Staff);
StaffSchema.index({ tenantId: 1, employeeId: 1 }, { unique: true });
StaffSchema.index({ tenantId: 1, email: 1 }, { sparse: true });
