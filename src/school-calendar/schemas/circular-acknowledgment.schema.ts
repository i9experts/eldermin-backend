import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CircularAcknowledgmentDocument = CircularAcknowledgment & Document;

@Schema({ timestamps: true, collection: 'circular_acknowledgments' })
export class CircularAcknowledgment {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Circular' }) circularId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' }) userId: Types.ObjectId;
  @Prop() userName: string;
  @Prop({ default: () => new Date() }) acknowledgedAt: Date;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const CircularAcknowledgmentSchema = SchemaFactory.createForClass(CircularAcknowledgment);
CircularAcknowledgmentSchema.index({ circularId: 1, userId: 1 }, { unique: true });
