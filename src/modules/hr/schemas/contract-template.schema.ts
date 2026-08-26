import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ContractTemplateDocument = ContractTemplate & Document;

// Contract WORDING template - the free-text body (with {{variable}}
// placeholders, e.g. {{staffName}}, {{designation}}, {{startDate}}) that
// gets rendered into a new contract's Terms & Conditions. Deliberately
// separate from a ReportTemplate (report-templates module), which controls
// only the printed PDF's letterhead/layout/branding, not its wording -
// every institution needs to customise both independently.
@Schema({ timestamps: true, collection: 'hrContractTemplates' })
export class ContractTemplate {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ index: true }) schoolSlug: string;
  @Prop({ required: true }) name: string;
  @Prop({ enum: ['permanent', 'fixed_term', 'probationary', 'part_time', 'visiting', 'renewal', 'all'], default: 'all' })
  contractType: string;
  @Prop({ required: true }) body: string;
  @Prop({ default: false }) isDefault: boolean;
  @Prop({ type: Types.ObjectId, ref: 'User' }) createdBy: Types.ObjectId;
}
export const ContractTemplateSchema = SchemaFactory.createForClass(ContractTemplate);
ContractTemplateSchema.index({ tenantId: 1, name: 1 });
