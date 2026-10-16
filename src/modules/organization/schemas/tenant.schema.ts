import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TenantDocument = Tenant & Document;

@Schema({ timestamps: true, collection: 'tenants' })
export class Tenant {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  slug: string;

  @Prop({ required: true })
  displayName: string;

  // 'academic'/'operations' kept only so pre-existing documents written
  // before the Starter/Growth/Enterprise packages still validate on
  // resave; new writes should use 'growth' (module-registry.ts's
  // modulesForPlan treats 'academic'/'operations' as an alias for it).
  @Prop({ default: 'trial', enum: ['trial','starter','growth','enterprise','academic','operations'] })
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
