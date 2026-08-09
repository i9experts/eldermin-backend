import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type HiringSettingsDocument = HiringSettings & Document;

// The configuration layer over the (already fully-built) Recruitment
// workflow — configurable interview pipeline stages, a reusable offer
// letter template, and default screening questions per opening.
@Schema({ timestamps: true, collection: 'hr_hiring_settings' })
export class HiringSettings {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, index: true, unique: true }) schoolSlug: string;

  @Prop({
    type: [{ name: String, order: Number, _id: false }],
    default: [
      { name: 'Screening', order: 1 },
      { name: 'Interview', order: 2 },
      { name: 'Final Interview', order: 3 },
      { name: 'Offer', order: 4 },
    ],
  })
  interviewStages: { name: string; order: number }[];

  @Prop() offerLetterTemplate: string; // plain text/simple markup with {{placeholders}}, rendered when an offer is generated

  @Prop({ type: [String], default: [] }) defaultScreeningQuestions: string[];
}

export const HiringSettingsSchema = SchemaFactory.createForClass(HiringSettings);
