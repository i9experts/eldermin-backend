import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ChartOfAccountsDocument = ChartOfAccounts & Document;

@Schema({ timestamps: true, collection: 'chartOfAccounts' })
export class ChartOfAccounts {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' })
  institutionId: Types.ObjectId;

  @Prop({ required: true })
  code: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, enum: ['asset', 'liability', 'equity', 'income', 'expense'] })
  type: string;

  @Prop()
  subType: string;

  @Prop({ type: Types.ObjectId, ref: 'ChartOfAccounts', default: null })
  parentId: Types.ObjectId;

  @Prop()
  parentCode: string;

  @Prop({ default: 1 })
  level: number;

  @Prop({ enum: ['debit', 'credit'], default: 'debit' })
  normalBalance: string;

  @Prop({ default: 0 })
  balance: number;

  @Prop({ default: true })
  isPostable: boolean;

  @Prop({ default: false })
  isSystemAccount: boolean;

  @Prop({ default: 'USD' })
  currency: string;

  @Prop({ default: true })
  isActive: boolean;
}

export const ChartOfAccountsSchema = SchemaFactory.createForClass(ChartOfAccounts);
ChartOfAccountsSchema.index({ tenantId: 1, code: 1 }, { unique: true });
ChartOfAccountsSchema.index({ tenantId: 1, type: 1 });
