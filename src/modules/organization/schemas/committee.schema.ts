import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CommitteeDocument = Committee & Document;

@Schema({ timestamps: true, collection: 'committees' })
export class Committee {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' })
  institutionId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  code: string;

  @Prop({ enum: ['academic', 'administrative', 'disciplinary', 'welfare', 'examination', 'religious', 'cultural', 'sports', 'parent', 'other'], default: 'academic' })
  type: string;

  @Prop()
  purpose: string;

  @Prop({ type: [{ memberId: Types.ObjectId, role: String, _id: false }], default: [] })
  members: { memberId: Types.ObjectId; role: string }[];

  @Prop({ default: true })
  isActive: boolean;
}

export const CommitteeSchema = SchemaFactory.createForClass(Committee);
CommitteeSchema.index({ tenantId: 1, code: 1 }, { unique: true });
