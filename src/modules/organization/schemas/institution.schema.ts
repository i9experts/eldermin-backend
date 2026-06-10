import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type InstitutionDocument = Institution & Document;

@Schema({ timestamps: true, collection: 'institutions' })
export class Institution {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' })
  tenantId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop()
  legalName: string;

  @Prop()
  code: string;

  @Prop({ enum: ['school','college','university','training_center','madrasa','other'], default: 'school' })
  type: string;

  @Prop()
  logoUrl: string;

  @Prop()
  website: string;

  @Prop()
  email: string;

  @Prop()
  phone: string;

  @Prop({
    type: { street: String, city: String, state: String, country: String, postalCode: String },
    default: {},
  })
  address: { street: string; city: string; state: string; country: string; postalCode: string };

  @Prop({ default: 'national' })
  curriculumSystem: string;

  @Prop({ default: 'annual' })
  academicSystem: string;

  @Prop({ default: 'en' })
  language: string;

  @Prop({ default: 'USD' })
  currency: string;

  @Prop({ default: 'UTC' })
  timezone: string;

  @Prop({
    type: {
      isMultiCampus: { type: Boolean, default: false },
      weekStartDay: { type: Number, default: 0 },
      workingDays: { type: [Number], default: [0,1,2,3,4] },
      attendanceMethod: { type: String, default: 'manual' },
      allowParentPortal: { type: Boolean, default: true },
      allowStudentPortal: { type: Boolean, default: true },
    },
    default: {},
  })
  settings: Record<string, any>;

  @Prop({ default: 0 })
  studentCount: number;

  @Prop({ default: 0 })
  staffCount: number;

  @Prop({ default: true })
  isActive: boolean;
}

export const InstitutionSchema = SchemaFactory.createForClass(Institution);
InstitutionSchema.index({ tenantId: 1 }, { unique: true });
