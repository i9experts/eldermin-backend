import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SalaryComponentDocument = SalaryComponent & Document;

// The actual "root system" for payroll — each school defines its own
// components here (name, whether it's an earning or a deduction, how it's
// calculated) instead of the app hardcoding a fixed Basic/HRA/Transport/
// Medical set. Different schools genuinely run different payroll
// structures (some have Provident Fund, some don't; some have a Ramadan
// bonus, a hostel deduction, a fuel allowance — this has to be
// school-configurable, not baked into the code.
@Schema({ timestamps: true, collection: 'salary_components' })
export class SalaryComponent {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, index: true }) schoolSlug: string;

  @Prop({ required: true }) name: string;
  @Prop({ required: true }) code: string; // short, unique-per-school identifier, e.g. 'BASIC', 'HRA'

  @Prop({ required: true, enum: ['earning', 'deduction'] }) type: string;

  // How the amount for this component actually gets determined:
  // - fixed: a flat amount, the same for whoever it's assigned to unless overridden
  // - percentage_of_basic: computed live from that employee's own Basic Salary
  // - manual: no default at all — entered fresh for each payroll run/each employee
  @Prop({ required: true, enum: ['fixed', 'percentage_of_basic', 'manual'], default: 'fixed' })
  calculationType: string;

  @Prop() defaultAmount: number; // used when calculationType is 'fixed'
  @Prop() percentageValue: number; // used when calculationType is 'percentage_of_basic', e.g. 40 = 40%

  @Prop({ default: true }) isTaxable: boolean;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ default: 0 }) displayOrder: number;
  @Prop() description: string;
}

export const SalaryComponentSchema = SchemaFactory.createForClass(SalaryComponent);
SalaryComponentSchema.index({ schoolSlug: 1, code: 1 }, { unique: true });
SalaryComponentSchema.index({ schoolSlug: 1, isActive: 1 });
