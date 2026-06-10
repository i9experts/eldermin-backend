import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MeetingDocument = Meeting & Document;

@Schema({ timestamps: true, collection: 'institutionMeetings' })
export class Meeting {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' })
  institutionId: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop({ enum: ['board', 'committee', 'staff', 'parent', 'emergency', 'other'], default: 'staff' })
  type: string;

  @Prop({ required: true })
  scheduledAt: Date;

  @Prop()
  venue: string;

  @Prop()
  agenda: string;

  @Prop()
  minutesS3Key: string;

  @Prop({ enum: ['scheduled', 'completed', 'cancelled', 'postponed'], default: 'scheduled' })
  status: string;

  @Prop({ default: true })
  isActive: boolean;
}

export const MeetingSchema = SchemaFactory.createForClass(Meeting);
MeetingSchema.index({ tenantId: 1, scheduledAt: -1 });
MeetingSchema.index({ tenantId: 1, status: 1 });
