import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TenantDocument = Tenant & Document;

@Schema({ timestamps: true, collection: 'tenants' })
export class Tenant {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  slug: string;

  @Prop({ required: true })
  displayName: string;

  @Prop({ default: 'trial', enum: ['trial','starter','academic','operations','enterprise'] })
  plan: string;

  @Prop({ default: 'onboarding', enum: ['active','trial','suspended','cancelled','onboarding'] })
  status: string;

  @Prop({ type: [String], default: ['organization'] })
  activeModules: string[];

  @Prop()
  billingEmail: string;

  @Prop({ default: false })
  isSetupComplete: boolean;
}

export const TenantSchema = SchemaFactory.createForClass(Tenant);
