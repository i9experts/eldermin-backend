import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Staff, StaffDocument } from '../modules/hr/schemas/staff.schema';
import { TeacherProfile, TeacherProfileDocument } from '../modules/teaching/schemas/teacher-profile.schema';
import { resolveTeacherIdentity, TeacherClassRef } from '../staff-portal/teacher-identity.util';
import { classIncludes } from '../behaviour/behaviour-teacher-scope';
import { teacherScopeVerdict } from '../auth/teacher-scope-verdict';

export { teacherScopeGuardMode } from '../auth/teacher-scope-verdict';
export type { TeacherScopeMode } from '../auth/teacher-scope-verdict';

/** Does the token carry class-teacher claims? (same two shapes resolveClassSectionScope reads) */
export function hasClassTeacherClaims(user: any): boolean {
  return !!(user?.classTeacherAssignments?.length || user?.classTeacherOfGradeName);
}

/** The classes a teacher is CLASS TEACHER of (never their subject assignments: the web lets only the class teacher mark attendance). */
export function classTeacherClassesOf(profile: any): TeacherClassRef[] {
  const out: TeacherClassRef[] = [];
  if (profile?.classTeacherAssignments?.length) {
    for (const a of profile.classTeacherAssignments) if (a?.gradeName) out.push({ grade: a.gradeName, section: a.sectionName || undefined });
  } else if (profile?.isClassTeacher && profile.classTeacherOfGradeName) {
    out.push({ grade: profile.classTeacherOfGradeName, section: profile.classTeacherOfSectionName || undefined });
  }
  return out;
}

/**
 * Who may MARK student attendance (R1, item 2). The web (Eldermin-Frontend src/pages/teaching/tabs/AttendanceTab.tsx:31-43,290) lets ONLY a
 * class teacher mark, and only their own class, in daily AND subject-wise mode (a subject teacher of another class has no marking UI; subject
 * mode just adds a subject to the class teacher's own class). The API only enforced that when the JWT carried class-teacher claims
 * (auth/scope.util.ts resolveClassSectionScope): a TEACHER whose token had none could mark any class.
 *
 * Applies to the base role `teacher` only (admins, principals, coordinators keep today's behaviour). A token WITH claims is already held to its
 * class(es) by resolveClassSectionScope (403 in both modes, unchanged). A token WITHOUT claims is checked against the database: a class teacher
 * whose token predates the assignment is allowed for exactly their classes; anyone else is a would-deny.
 */
@Injectable()
export class TeacherAttendanceScopeService {
  constructor(
    @InjectModel(Staff.name) private staffModel: Model<StaffDocument>,
    @InjectModel(TeacherProfile.name) private profileModel: Model<TeacherProfileDocument>,
  ) {}

  private async dbClasses(user: any): Promise<TeacherClassRef[]> {
    try {
      const me = await resolveTeacherIdentity(this.staffModel, this.profileModel, user);
      const profile: any = await this.profileModel.findOne({ staffId: me.staffId as any })
        .select('isClassTeacher classTeacherOfGradeName classTeacherOfSectionName classTeacherAssignments').lean();
      return classTeacherClassesOf(profile);
    } catch (err) {
      if (err instanceof ForbiddenException) return [];            // no staff profile: not a class teacher
      throw err;
    }
  }

  private verdict(user: any, route: string, reason: string, message: string): void {
    teacherScopeVerdict(user, route, reason, message);
  }

  /** records: the (grade, section) pairs being marked. Empty = only "is a class teacher" is checked (revert by id). */
  async assertMayMark(user: any, records: Array<{ grade?: string; section?: string }>, route: string): Promise<void> {
    const role = String(user?.role || user?.primaryRole || '');
    if (role !== 'teacher') return;
    if (hasClassTeacherClaims(user)) return;                      // held to its class(es) by resolveClassSectionScope
    const classes = await this.dbClasses(user);
    if (!classes.length) {
      return this.verdict(user, route, 'teacher_not_class_teacher', 'Only the class teacher of a class can mark its attendance.');
    }
    for (const r of records) {
      if (!classIncludes(classes, r.grade, r.section)) {
        return this.verdict(user, route, 'teacher_marks_other_class', 'You are the class teacher of your own assigned class only.');
      }
    }
  }
}
