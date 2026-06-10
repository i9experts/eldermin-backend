import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ExpenseDocument = Expense & Document;

@Schema({ timestamps: true, collection: 'expenses' })
export class Expense {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' })
  institutionId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Campus' })
  campusId: Types.ObjectId;

  @Prop({ required: true })
  expenseNo: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ default: 'USD' })
  currency: string;

  @Prop({ required: true })
  expenseDate: Date;

  @Prop()
  category: string;

  @Prop()
  paidTo: string;

  @Prop({ enum: ['draft','submitted','approved','rejected','posted'], default: 'draft' })
  status: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  submittedBy: Types.ObjectId;
}

export const ExpenseSchema = SchemaFactory.createForClass(Expense);
ExpenseSchema.index({ tenantId: 1, expenseNo: 1 }, { unique: true });
ExpenseSchema.index({ tenantId: 1, campusId: 1, expenseDate: -1 });
