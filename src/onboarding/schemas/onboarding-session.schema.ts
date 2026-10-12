import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type OnboardingSessionDocument = OnboardingSession & Document;

@Schema({ timestamps: true })
export class OnboardingSession {
  @Prop({ required: true }) userId: string;
  @Prop({ required: true }) schoolSlug: string;
  @Prop({ required: true }) schoolName: string;
  @Prop({ default: 1 }) currentStep: number;
  @Prop({ default: false }) isComplete: boolean;

  // Links this session to the MarketingLead created alongside it at
  // register() time, so Super Admin's CRM Leads Pipeline can see this
  // self-service signup and later steps can enrich that same lead record
  // instead of creating a new one. Optional/unset for sessions created
  // before this existed - nothing reads it as required.
  @Prop() leadId?: string;

  @Prop({ type: Object, default: {} }) step1: Record<string, any>;
  @Prop({ type: Object, default: {} }) step2: Record<string, any>;
  @Prop({ type: Object, default: {} }) step3: Record<string, any>;
  @Prop({ type: Object, default: {} }) step4: Record<string, any>;
  @Prop({ type: Object, default: {} }) step5: Record<string, any>;
  @Prop({ type: Object, default: {} }) step6: Record<string, any>;
  @Prop({ type: Object, default: {} }) step7: Record<string, any>;
}

export const OnboardingSessionSchema = SchemaFactory.createForClass(OnboardingSession);
