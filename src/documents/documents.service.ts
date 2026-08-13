import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  DocumentRecord, DocumentRecordDocument,
  WorkflowTemplate, WorkflowTemplateDocument,
  WorkflowInstance, WorkflowInstanceDocument,
} from './schemas/documents.schema';
import { buildInclusiveCampusFilter, resolveCampusScope, ScopedUser } from '../auth/scope.util';

const paged = (page = 1, limit = 20) => ({ skip: (page - 1) * limit, limit });

@Injectable()
export class DocumentsService {
  constructor(
    @InjectModel(DocumentRecord.name) private docModel: Model<DocumentRecordDocument>,
    @InjectModel(WorkflowTemplate.name) private templateModel: Model<WorkflowTemplateDocument>,
    @InjectModel(WorkflowInstance.name) private instanceModel: Model<WorkflowInstanceDocument>,
  ) {}

  // ── Dashboard ──────────────────────────────────────────
  async getDashboard(schoolSlug: string) {
    const [
      totalDocs, activeDocs, expiringSoon,
      totalWorkflows, pendingWorkflows, completedWorkflows,
      byCategory, recentDocs, pendingApprovals,
    ] = await Promise.all([
      this.docModel.countDocuments({ schoolSlug }),
      this.docModel.countDocuments({ schoolSlug, status: 'active' }),
      this.docModel.countDocuments({
        schoolSlug, status: 'active',
        expiryDate: { $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
      }),
      this.instanceModel.countDocuments({ schoolSlug }),
      this.instanceModel.countDocuments({ schoolSlug, status: { $in: ['pending','in_progress'] } }),
      this.instanceModel.countDocuments({ schoolSlug, status: 'approved' }),
      this.docModel.aggregate([
        { $match: { schoolSlug } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      this.docModel.find({ schoolSlug }).sort({ createdAt: -1 }).limit(5)
        .select('title category status createdAt uploadedBy'),
      this.instanceModel.find({ schoolSlug, status: { $in: ['pending','in_progress'] } })
        .sort({ createdAt: -1 }).limit(8)
        .select('instanceNumber workflowName subject status currentStep initiatedBy createdAt'),
    ]);

    return {
      stats: { totalDocs, activeDocs, expiringSoon, totalWorkflows, pendingWorkflows, completedWorkflows },
      byCategory, recentDocs, pendingApprovals,
    };
  }

  // ── Documents ──────────────────────────────────────────
  async getDocuments(schoolSlug: string, query: any, requestingUser?: ScopedUser) {
    const { page = 1, limit = 20, category, status, visibility, search, campusId } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug };
    if (category) filter.category = category;
    if (status) filter.status = status;
    if (visibility) filter.visibility = visibility;
    // A document with no campusId at all means "applies to every
    // campus" (school-wide policy/circular), so campus-scoped roles see
    // their own campus's documents PLUS those - never just excluded, the
    // way an unassigned Expense/Budget would be.
    const campusFilter = requestingUser ? buildInclusiveCampusFilter(requestingUser, campusId) : (campusId ? { campusId } : null);
    const searchOr = search ? [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
      { tags: { $in: [new RegExp(search, 'i')] } },
    ] : null;
    if (campusFilter && searchOr) {
      filter.$and = [campusFilter, { $or: searchOr }];
    } else if (campusFilter) {
      Object.assign(filter, campusFilter);
    } else if (searchOr) {
      filter.$or = searchOr;
    }
    const [data, total] = await Promise.all([
      this.docModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      this.docModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async createDocument(data: any, requestingUser?: ScopedUser) {
    const doc = new this.docModel({
      ...data,
      campusId: requestingUser?.campusId ? new Types.ObjectId(requestingUser.campusId) : (data.campusId ? new Types.ObjectId(data.campusId) : null),
    });
    return doc.save();
  }

  async updateDocument(id: string, schoolSlug: string, data: any) {
    return this.docModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: data }, { new: true });
  }

  async archiveDocument(id: string, schoolSlug: string) {
    return this.docModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: { status: 'archived' } }, { new: true });
  }

  async incrementView(id: string, schoolSlug: string) {
    return this.docModel.findOneAndUpdate(
      { _id: id, schoolSlug }, { $inc: { viewCount: 1 } }, { new: true },
    );
  }

  // ── Workflow Templates ─────────────────────────────────
  async getTemplates(schoolSlug: string, type?: string) {
    const filter: any = { schoolSlug, isActive: true };
    if (type) filter.type = type;
    return this.templateModel.find(filter).sort({ name: 1 });
  }

  async createTemplate(data: any) {
    const tmpl = new this.templateModel(data);
    return tmpl.save();
  }

  async seedDefaultTemplates(schoolSlug: string) {
    const defaults = [
      {
        name: 'Expense Approval',
        type: 'expense',
        steps: [
          { name: 'Department Head Review', order: 1, action: 'approve', assignedRole: 'dept_head', dueDays: 2 },
          { name: 'Finance Manager Approval', order: 2, action: 'approve', assignedRole: 'finance_manager', dueDays: 3 },
          { name: 'Principal Final Approval', order: 3, action: 'approve', assignedRole: 'principal', dueDays: 2 },
        ],
      },
      {
        name: 'Leave Request Approval',
        type: 'leave',
        steps: [
          { name: 'Line Manager Approval', order: 1, action: 'approve', assignedRole: 'line_manager', dueDays: 1 },
          { name: 'HR Acknowledgement', order: 2, action: 'acknowledge', assignedRole: 'hr_manager', dueDays: 1 },
        ],
      },
      {
        name: 'Procurement Approval',
        type: 'procurement',
        steps: [
          { name: 'Department Head Approval', order: 1, action: 'approve', assignedRole: 'dept_head', dueDays: 2 },
          { name: 'Finance Review', order: 2, action: 'review', assignedRole: 'finance_manager', dueDays: 3 },
          { name: 'Principal Approval', order: 3, action: 'approve', assignedRole: 'principal', dueDays: 3 },
        ],
      },
      {
        name: 'Admission Decision',
        type: 'admission',
        steps: [
          { name: 'Admission Officer Review', order: 1, action: 'review', assignedRole: 'admission_officer', dueDays: 2 },
          { name: 'Principal Decision', order: 2, action: 'approve', assignedRole: 'principal', dueDays: 2 },
        ],
      },
    ];

    for (const tmpl of defaults) {
      await this.templateModel.findOneAndUpdate(
        { name: tmpl.name, schoolSlug },
        { $setOnInsert: { ...tmpl, schoolSlug, isActive: true } },
        { upsert: true, new: true },
      );
    }
    return this.templateModel.find({ schoolSlug });
  }

  // ── Workflow Instances ─────────────────────────────────
  async getInstances(schoolSlug: string, query: any, requestingUser?: ScopedUser) {
    const { page = 1, limit = 20, status, type, assignedTo, campusId } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug };
    if (status) filter.status = status;
    if (type) filter.workflowType = type;
    if (assignedTo) filter['steps.assignedTo'] = assignedTo;
    const effectiveCampusId = requestingUser ? resolveCampusScope(requestingUser, campusId) : campusId;
    if (effectiveCampusId) filter.campusId = effectiveCampusId;
    const [data, total] = await Promise.all([
      this.instanceModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      this.instanceModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async initiateWorkflow(data: any, requestingUser?: ScopedUser) {
    const template = await this.templateModel.findById(data.templateId);
    if (!template) throw new NotFoundException('Workflow template not found');

    const steps = template.steps.map(s => ({
      stepOrder: s.order, stepName: s.name,
      status: 'pending', assignedTo: s.assignedTo,
      assignedToId: s.assignedToId, action: s.action,
      dueDate: new Date(Date.now() + s.dueDays * 24 * 60 * 60 * 1000),
    }));

    const instance = new this.instanceModel({
      ...data,
      templateId: template._id,
      workflowName: template.name,
      workflowType: template.type,
      steps,
      currentStep: 1,
      status: 'in_progress',
      campusId: requestingUser?.campusId ? new Types.ObjectId(requestingUser.campusId) : (data.campusId ? new Types.ObjectId(data.campusId) : null),
    });
    return instance.save();
  }

  async takeAction(id: string, schoolSlug: string, stepOrder: number, action: 'approve'|'reject', actionBy: string, comments?: string) {
    const instance = await this.instanceModel.findOne({ _id: id, schoolSlug });
    if (!instance) throw new NotFoundException('Workflow not found');

    const step = instance.steps.find(s => s.stepOrder === stepOrder);
    if (!step) throw new NotFoundException('Step not found');

    step.status = action === 'approve' ? 'approved' : 'rejected';
    step.actionBy = actionBy;
    step.actionAt = new Date();
    step.comments = comments || '';

    if (action === 'reject') {
      instance.status = 'rejected';
      instance.completedAt = new Date();
    } else {
      const nextStep = instance.steps.find(s => s.stepOrder === stepOrder + 1);
      if (nextStep) {
        instance.currentStep = nextStep.stepOrder;
      } else {
        instance.status = 'approved';
        instance.completedAt = new Date();
      }
    }

    await instance.save();
    return instance;
  }

  async cancelWorkflow(id: string, schoolSlug: string, cancelledBy: string, reason: string) {
    return this.instanceModel.findOneAndUpdate(
      { _id: id, schoolSlug },
      { $set: { status: 'cancelled', cancelledBy, cancelReason: reason, completedAt: new Date() } },
      { new: true },
    );
  }

  async getMyPendingApprovals(schoolSlug: string, userName: string) {
    return this.instanceModel.find({
      schoolSlug,
      status: 'in_progress',
      steps: { $elemMatch: { assignedTo: userName, status: 'pending' } },
    }).sort({ createdAt: -1 });
  }
}
