import { Types } from 'mongoose';
import { gradeMatcher, sectionMatcher } from '../common/utils/class-match.util';

// ============================================================
// COURSE VISIBILITY — LMS Phase 1
// The "$or: [autoFilter, manualFilter]" shape every reader of course
// content needs: an 'auto_by_class' syllabus (the default) is matched by
// grade/section/campus exactly as before enrollmentMode existed; a
// 'manual' (elective) syllabus is matched purely by an active
// CourseEnrollment row instead. Shared here so getMyCourses,
// getStudentLearning, and the forum feature can't drift against each
// other on who is allowed to see a given course.
// ============================================================

export interface CourseVisibilityStudent {
  currentGrade?: string;
  currentSection?: string;
  campusId?: any;
}

export function buildCourseVisibilityFilter(
  tenantId: string,
  student: CourseVisibilityStudent,
  enrolledSyllabusIds: any[],
): Record<string, any> {
  const autoFilter: any = {
    tenantId, gradeLevel: gradeMatcher(student.currentGrade), publishedToStudents: true,
    enrollmentMode: { $ne: 'manual' },
    $and: [
      { $or: [{ sectionName: sectionMatcher(student.currentSection) }, { sectionName: { $exists: false } }, { sectionName: null }] },
    ],
  };
  if (student.campusId) autoFilter.$and.push({ $or: [{ campusId: new Types.ObjectId(student.campusId) }, { campusId: null }] });

  const manualFilter = { tenantId, publishedToStudents: true, enrollmentMode: 'manual', _id: { $in: enrolledSyllabusIds } };

  return { $or: [autoFilter, manualFilter] };
}
