import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FeeHeadDocument = FeeHead & Document;

@Schema({ timestamps: true, collection: 'feeHeads' })
export class FeeHead {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' })
  institutionId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  code: string;

  @Prop({ enum: ['tuition','transport','hostel','library','lab','activity','exam','admission','development','uniform','books','miscellaneous','penalty','refundable'], default: 'tuition' })
  category: string;

  @Prop({ default: false })
  isRefundable: boolean;

  @Prop({ default: false })
  isTaxable: boolean;

  @Prop({ default: 0 })
  taxRate: number;

  @Prop()
  description: string;

  @Prop()
  glAccountCode: string;

  @Prop({ default: true })
  isActive: boolean;
}

export const FeeHeadSchema = SchemaFactory.createForClass(FeeHead);
FeeHeadSchema.index({ tenantId: 1, code: 1 }, { unique: true });
