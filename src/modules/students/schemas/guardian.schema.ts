import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type GuardianDocument = Guardian & Document;

@Schema({ timestamps: true, collection: 'guardians' })
export class Guardian {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ required: true }) firstName: string;
  @Prop({ required: true }) lastName: string;
  @Prop({ required: true }) phone: string;
  @Prop() email: string;
  @Prop() whatsapp: string;
  @Prop() occupation: string;
  @Prop() employer: string;
  @Prop({ type: { street: String, city: String, country: String }, default: {} }) address: Record<string, any>;
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Student' }], default: [] }) linkedStudentIds: Types.ObjectId[];
  @Prop({ type: Types.ObjectId, ref: 'User', default: null }) userId: Types.ObjectId;
  @Prop({ default: true }) isActive: boolean;
}
export const GuardianSchema = SchemaFactory.createForClass(Guardian);
GuardianSchema.index({ tenantId: 1, phone: 1 });
GuardianSchema.index({ tenantId: 1, linkedStudentIds: 1 });
