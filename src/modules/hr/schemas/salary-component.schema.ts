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
  // - manual: no default at all — entered fresh for each payroll run/each employee
  // - percentage_of_basic: computed live from that employee's own Basic Salary
  // - percentage_of_gross: computed from gross salary (the sum of every
  //   non-percentage_of_gross earning component - see SalaryCalcEngine for
  //   why: a component can't safely be a percentage of a total that
  //   includes itself)
  // - percentage_of_components: computed from one or more OTHER named
  //   components (basisComponentCodes), e.g. "PF = 10% of (Basic + HRA)"
  @Prop({
    required: true,
    enum: ['fixed', 'manual', 'percentage_of_basic', 'percentage_of_gross', 'percentage_of_components'],
    default: 'fixed',
  })
  calculationType: string;

  @Prop() defaultAmount: number; // used when calculationType is 'fixed'
  @Prop() percentageValue: number; // used by every percentage_* type, e.g. 40 = 40%
  // Which other components' amounts this one is a percentage of, by code -
  // only used/required when calculationType is 'percentage_of_components'.
  // SalaryCalcEngine computes components in dependency order and rejects a
  // cycle (e.g. A depends on B and B depends on A) outright.
  @Prop({ type: [String], default: [] }) basisComponentCodes: string[];

  @Prop({ default: true }) isTaxable: boolean;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ default: 0 }) displayOrder: number;
  @Prop() description: string;

  // Chart of Accounts mapping - where this component posts to when payroll
  // is approved. Earnings post a debit here (an expense account); deductions
  // post a credit here (a payable/liability, or occasionally a receivable
  // for a recovery). Left blank at creation time so existing schools aren't
  // silently broken, but PayrollService.postPayslipToLedger refuses to post
  // any payslip that uses a component with no accountCode configured -
  // see PAY-03.
  @Prop({ type: String, default: null }) accountCode: string | null;

  // Employer-side contribution (e.g. employer's matching PF share) - a real
  // cost to the school that isn't deducted from the employee at all, so it
  // needs its own expense + payable pair distinct from the employee-facing
  // component above.
  @Prop({ default: false }) hasEmployerContribution: boolean;
  @Prop() employerContributionPercentage: number; // % of this component's own employee-side amount
  @Prop({ type: String, default: null }) employerContributionExpenseAccountCode: string | null;
  @Prop({ type: String, default: null }) employerContributionPayableAccountCode: string | null;
}

export const SalaryComponentSchema = SchemaFactory.createForClass(SalaryComponent);
SalaryComponentSchema.index({ schoolSlug: 1, code: 1 }, { unique: true });
SalaryComponentSchema.index({ schoolSlug: 1, isActive: 1 });
