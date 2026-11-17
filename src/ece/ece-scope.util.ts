import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { resolveCampusScope, ScopedUser } from '../auth/scope.util';

/**
 * Early Years campus scope. Student.campusId (string) is the campus of a child. Campus- and teacher-level callers see only children of their
 * own campus (a caller with no campus assigned gets the usual clear 403 from resolveCampusScope); owner / super_admin / institution-level
 * callers see the whole school. A child without a campus is visible only to institution-level callers (ownership unclear: hide).
 */
export function eceCampusOf(user: ScopedUser | undefined | null): string | undefined {
  return user ? resolveCampusScope(user, undefined) : undefined;
}

/** The child must exist IN THIS SCHOOL and, for a campus-scoped caller, at their campus. 400 malformed id, 404 unknown/other school, 403 other campus. */
export async function assertEceStudentInScope(studentModel: any, schoolSlug: string, studentId: unknown, user?: ScopedUser | null): Promise<void> {
  const id = String(studentId ?? '');
  if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid student id');
  const student: any = await studentModel.findOne({ _id: id, schoolSlug }).select('campusId').lean();
  if (!student) throw new NotFoundException('Student not found');
  const campus = eceCampusOf(user);
  if (campus && String(student.campusId ?? '') !== String(campus)) {
    throw new ForbiddenException('This child is not at your campus.');
  }
}

/** Ids of the school's Early Years children at the caller's campus, or undefined when the caller is not campus-scoped. */
export async function eceScopedStudentIds(studentModel: any, schoolSlug: string, user?: ScopedUser | null): Promise<any[] | undefined> {
  const campus = eceCampusOf(user);
  if (!campus) return undefined;
  const rows: any[] = await studentModel.find({ schoolSlug, campusId: campus }).select('_id').lean();
  return rows.map((r) => r._id);
}
