import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongoDoc, Types } from 'mongoose';

// ============================================================
// SCHEMA: DOCUMENT RECORD
// ============================================================
export type DocumentRecordDocument = DocumentRecord & MongoDoc;

@Schema({ timestamps: true, collection: 'documents' })
export class DocumentRecord {
  @Prop({ required: true }) title: string;
  @Prop() description: string;
  @Prop({
    enum: ['policy','form','template','letter','certificate','report',
           'contract','notice','circular','admission_doc','hr_doc','finance_doc','other'],
    default: 'other',
  })
  category: string;
  @Prop() fileUrl: string;
  @Prop() fileName: string;
  @Prop() fileSize: number;
  @Prop() fileType: string;
  @Prop() version: string;
  @Prop() tags: string[];
  @Prop({
    enum: ['draft','active','archived','expired'],
    default: 'draft',
  })
  status: string;
  @Prop() expiryDate: Date;
  @Prop() effectiveDate: Date;
  @Prop({
    enum: ['public','staff_only','admin_only','confidential'],
    default: 'staff_only',
  })
  visibility: string;
  @Prop({ default: 0 }) downloadCount: number;
  @Prop({ default: 0 }) viewCount: number;
  @Prop() uploadedBy: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) uploadedById: Types.ObjectId;
  @Prop() relatedTo: string;
  @Prop() relatedToType: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}

export const DocumentRecordSchema = SchemaFactory.createForClass(DocumentRecord);
DocumentRecordSchema.index({ schoolSlug: 1, category: 1, status: 1 });
DocumentRecordSchema.index({ schoolSlug: 1, tags: 1 });

// ============================================================
// SCHEMA: WORKFLOW TEMPLATE
// ============================================================
export type WorkflowTemplateDocument = WorkflowTemplate & MongoDoc;

@Schema({ _id: true })
class WorkflowStep {
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) order: number;
  @Prop({
    enum: ['approve','review','acknowledge','sign','upload_doc'],
    default: 'approve',
  })
  action: string;
  @Prop() assignedRole: string;
  @Prop() assignedTo: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) assignedToId: Types.ObjectId;
  @Prop({ default: 3 }) dueDays: number;
  @Prop() instructions: string;
  @Prop({ default: false }) isOptional: boolean;
}
const WorkflowStepSchema = SchemaFactory.createForClass(WorkflowStep);

@Schema({ timestamps: true, collection: 'workflow_templates' })
export class WorkflowTemplate {
  @Prop({ required: true }) name: string;
  @Prop() description: string;
  @Prop({
    enum: ['leave','expense','procurement','admission','document','hr_action','custom'],
    default: 'custom',
  })
  type: string;
  @Prop({ type: [WorkflowStepSchema], default: [] }) steps: WorkflowStep[];
  @Prop({ default: true }) isActive: boolean;
  @Prop() createdBy: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}

export const WorkflowTemplateSchema = SchemaFactory.createForClass(WorkflowTemplate);

// ============================================================
// SCHEMA: WORKFLOW INSTANCE
// ============================================================
export type WorkflowInstanceDocument = WorkflowInstance & MongoDoc;

@Schema({ _id: true })
class StepAction {
  @Prop({ required: true }) stepOrder: number;
  @Prop({ required: true }) stepName: string;
  @Prop({
    enum: ['pending','approved','rejected','skipped'],
    default: 'pending',
  })
  status: string;
  @Prop() assignedTo: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) assignedToId: Types.ObjectId;
  @Prop() actionBy: string;
  @Prop() actionAt: Date;
  @Prop() comments: string;
  @Prop() dueDate: Date;
}
const StepActionSchema = SchemaFactory.createForClass(StepAction);

@Schema({ timestamps: true, collection: 'workflow_instances' })
export class WorkflowInstance {
  @Prop({ required: true, unique: true }) instanceNumber: string;
  @Prop({ type: Types.ObjectId, ref: 'WorkflowTemplate' }) templateId: Types.ObjectId;
  @Prop({ required: true }) workflowName: string;
  @Prop({ required: true }) workflowType: string;
  @Prop() subject: string;
  @Prop() description: string;
  @Prop() initiatedBy: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) initiatedById: Types.ObjectId;
  @Prop() relatedTo: string;
  @Prop() relatedToType: string;
  @Prop({ type: [StepActionSchema], default: [] }) steps: StepAction[];
  @Prop() currentStep: number;
  @Prop({
    enum: ['pending','in_progress','approved','rejected','cancelled'],
    default: 'pending',
  })
  status: string;
  @Prop() completedAt: Date;
  @Prop() cancelledBy: string;
  @Prop() cancelReason: string;
  @Prop() priority: string;
  @Prop() dueDate: Date;
  @Prop({ required: true, index: true }) schoolSlug: string;
}

export const WorkflowInstanceSchema = SchemaFactory.createForClass(WorkflowInstance);
WorkflowInstanceSchema.index({ schoolSlug: 1, status: 1 });
WorkflowInstanceSchema.index({ schoolSlug: 1, workflowType: 1 });
WorkflowInstanceSchema.index({ 'steps.assignedToId': 1, status: 1 });
WorkflowInstanceSchema.pre('validate', async function () {
  if (this.isNew && !this.instanceNumber) {
    const d = new Date();
    const rand = Math.floor(1000 + Math.random() * 9000);
    this.instanceNumber = `WF-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}-${rand}`;
  }
});
