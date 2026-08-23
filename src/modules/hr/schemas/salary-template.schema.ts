import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SalaryTemplateDocument = SalaryTemplate & Document;

// Addresses "everything is manual" directly: an admin defines a
// reusable structure once (e.g. "Teacher" - Basic 50,000, HRA 40%,
// Transport 5,000) and applies it to a new hire's Salary Structure
// instead of typing every component from scratch for every person.
// designationId is optional - a template can be tied to a specific
// designation for auto-suggestion, or left generic (e.g. "Standard
// Staff") for manual selection regardless of role.
@Schema({ timestamps: true, collection: 'salary_templates' })
export class SalaryTemplate {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, index: true }) schoolSlug: string;

  @Prop({ required: true }) name: string; // e.g. "Teacher", "Admin Staff"
  @Prop({ type: Types.ObjectId, ref: 'Designation' }) designationId: Types.ObjectId;

  // Real component links (not free-text amounts by name) - if a
  // component is later renamed or its calculation type changes, a
  // template built from it stays correctly linked rather than holding
  // a stale, duplicated copy of its old configuration.
  @Prop({
    type: [{ componentId: { type: Types.ObjectId, ref: 'SalaryComponent' }, amount: Number }],
    default: [],
  })
  lines: { componentId: Types.ObjectId; amount: number }[];

  @Prop() description: string;
  @Prop({ default: true }) isActive: boolean;
}

export const SalaryTemplateSchema = SchemaFactory.createForClass(SalaryTemplate);
SalaryTemplateSchema.index({ schoolSlug: 1, name: 1 }, { unique: true });
SalaryTemplateSchema.index({ schoolSlug: 1, designationId: 1 });
