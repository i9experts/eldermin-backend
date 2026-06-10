import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type TrainingDocument = Training & Document;

@Schema({ timestamps: true, collection: 'trainings' })
export class Training {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ required: true }) title: string;
  @Prop({ enum: ['internal','external','online','workshop','conference','certification'], default: 'internal' }) type: string;
  @Prop() provider: string;
  @Prop() description: string;
  @Prop({ required: true }) startDate: Date;
  @Prop({ required: true }) endDate: Date;
  @Prop() venue: string;
  @Prop() meetingLink: string;
  @Prop({ default: 0 }) cost: number;
  @Prop({ default: 'USD' }) currency: string;
  @Prop({ default: 0 }) maxParticipants: number;
  @Prop({ enum: ['upcoming','ongoing','completed','cancelled'], default: 'upcoming' }) status: string;
  @Prop({ type: [{ staffId: Types.ObjectId, staffName: String, status: String, completionDate: Date, score: Number, _id: false }], default: [] }) participants: any[];
  @Prop({ default: false }) isMandatory: boolean;
  @Prop({ type: [String], default: [] }) targetRoles: string[];
  @Prop({ type: Types.ObjectId, ref: 'User' }) createdBy: Types.ObjectId;
}
export const TrainingSchema = SchemaFactory.createForClass(Training);
TrainingSchema.index({ tenantId: 1, status: 1, startDate: 1 });
TrainingSchema.index({ tenantId: 1, 'participants.staffId': 1 });
