import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PolicyDocument = Policy & Document;

@Schema({ timestamps: true, collection: 'policies' })
export class Policy {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' })
  institutionId: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop({ enum: ['hr', 'academic', 'financial', 'operational', 'compliance', 'other'], default: 'hr' })
  category: string;

  @Prop()
  description: string;

  @Prop()
  documentS3Key: string;

  @Prop({ enum: ['draft', 'active', 'archived', 'under_review'], default: 'draft' })
  status: string;

  @Prop()
  effectiveDate: Date;

  @Prop()
  reviewDate: Date;

  @Prop({ default: true })
  isActive: boolean;
}

export const PolicySchema = SchemaFactory.createForClass(Policy);
PolicySchema.index({ tenantId: 1, status: 1 });
