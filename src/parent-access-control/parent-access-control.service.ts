// ============================================================
// PARENT APP FEATURE ACCESS CONTROL — service
// Eldermin ERP | NestJS
// ============================================================

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ParentFeatureAccess, ParentFeatureAccessDocument } from './schemas/parent-feature-access.schema';
import { PARENT_FEATURE_KEYS, ParentFeatureKey } from './parent-feature.constants';
import { SetParentFeatureAccessDto } from './dto/parent-feature-access.dto';
import { ScopedUser } from '../auth/scope.util';

export interface FeatureCheckResult {
  suspended: boolean;
  reason?: string;
}

@Injectable()
export class ParentAccessControlService {
  constructor(
    @InjectModel(ParentFeatureAccess.name) private model: Model<ParentFeatureAccessDocument>,
    @InjectModel('Student') private studentModel: Model<any>,
  ) {}

  /**
   * Called from each of the 6 suspendable parent-app endpoints before
   * returning real data. Only ever enforced for the PARENT role itself -
   * staff/admin viewing the same endpoint (e.g. a support impersonation
   * screen) are never blocked by a restriction placed on a parent account.
   */
  async checkFeature(
    schoolSlug: string,
    requestingUser: ScopedUser,
    studentId: string,
    feature: ParentFeatureKey,
  ): Promise<FeatureCheckResult> {
    const role = requestingUser.role || requestingUser.primaryRole;
    if (role !== 'parent' || !requestingUser.userId) return { suspended: false };

    const record = await this.model.findOne({
      schoolSlug, parentUserId: new Types.ObjectId(requestingUser.userId), studentId: new Types.ObjectId(studentId),
    }).lean();
    const state = record?.features?.[feature as any];
    if (!state?.suspended) return { suspended: false };
    return { suspended: true, reason: state.reason || undefined };
  }

  async getAccess(schoolSlug: string, parentUserId: string, studentId: string) {
    const student = await this.studentModel.findOne({ _id: studentId, schoolSlug })
      .select('firstName lastName currentGrade currentSection').lean();
    if (!student) throw new NotFoundException('Student not found');

    const record = await this.model.findOne({
      schoolSlug, parentUserId: new Types.ObjectId(parentUserId), studentId: new Types.ObjectId(studentId),
    }).lean();

    const features: Record<string, any> = {};
    for (const key of PARENT_FEATURE_KEYS) {
      const state = record?.features?.[key as any];
      features[key] = {
        suspended: state?.suspended || false,
        reason: state?.reason || null,
        suspendedAt: state?.suspendedAt || null,
        restoredAt: state?.restoredAt || null,
        history: state?.history || [],
      };
    }
    return {
      parentUserId, studentId,
      student: { firstName: (student as any).firstName, lastName: (student as any).lastName, grade: (student as any).currentGrade, section: (student as any).currentSection },
      features,
    };
  }

  async setFeatureAccess(
    schoolSlug: string,
    parentUserId: string,
    studentId: string,
    dto: SetParentFeatureAccessDto,
    adminUser: ScopedUser & { name?: string },
  ) {
    const student = await this.studentModel.findOne({ _id: studentId, schoolSlug })
      .select('campusId').lean();
    if (!student) throw new NotFoundException('Student not found');

    const now = new Date();
    const suspended = dto.action === 'suspend';
    const byUserId = new Types.ObjectId(adminUser.userId);
    const byName = adminUser.name || 'Admin';

    const setOps: Record<string, any> = {};
    const pushOps: Record<string, any> = {};
    for (const feature of dto.features) {
      setOps[`features.${feature}.suspended`] = suspended;
      setOps[`features.${feature}.reason`] = dto.reason || null;
      if (suspended) {
        setOps[`features.${feature}.suspendedAt`] = now;
        setOps[`features.${feature}.suspendedBy`] = byUserId;
      } else {
        setOps[`features.${feature}.restoredAt`] = now;
        setOps[`features.${feature}.restoredBy`] = byUserId;
      }
      pushOps[`features.${feature}.history`] = {
        action: suspended ? 'suspended' : 'restored',
        reason: dto.reason || undefined,
        byUserId, byName, at: now,
      };
    }

    const record = await this.model.findOneAndUpdate(
      { schoolSlug, parentUserId: new Types.ObjectId(parentUserId), studentId: new Types.ObjectId(studentId) },
      {
        $set: { ...setOps, campusId: (student as any).campusId || null },
        $push: Object.fromEntries(Object.entries(pushOps).map(([k, v]) => [k, v])),
        $setOnInsert: { schoolSlug, parentUserId: new Types.ObjectId(parentUserId), studentId: new Types.ObjectId(studentId) },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();

    return this.getAccess(schoolSlug, parentUserId, studentId);
  }

  /** Admin dashboard: every parent-student link with at least one feature currently suspended. */
  async listRestricted(schoolSlug: string, campusId?: string) {
    const filter: any = { schoolSlug };
    if (campusId) filter.campusId = campusId;
    const records = await this.model.find(filter).lean();

    const results = records
      .map((r) => {
        const suspendedFeatures = PARENT_FEATURE_KEYS.filter((key) => (r.features as any)?.[key]?.suspended);
        return suspendedFeatures.length ? { ...r, suspendedFeatures } : null;
      })
      .filter(Boolean) as any[];

    const studentIds = results.map((r) => r.studentId);
    const students = studentIds.length
      ? await this.studentModel.find({ _id: { $in: studentIds } }).select('firstName lastName currentGrade currentSection').lean()
      : [];
    const studentMap = new Map(students.map((s: any) => [String(s._id), s]));

    return results.map((r) => ({
      parentUserId: r.parentUserId,
      studentId: r.studentId,
      student: studentMap.get(String(r.studentId)) || null,
      suspendedFeatures: r.suspendedFeatures,
    }));
  }
}
