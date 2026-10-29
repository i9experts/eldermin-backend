import { Injectable } from '@nestjs/common';
import { SyllabusService } from '../syllabus/syllabus.service';
import { TeachingService } from '../modules/teaching/teaching.service';
import { AssessmentService } from '../assessments/assessment.service';
import { CertificatesService } from '../modules/certificates/certificates.service';
import { ScopedUser } from '../auth/scope.util';

@Injectable()
export class LmsService {
  constructor(
    private readonly syllabusService: SyllabusService,
    private readonly teachingService: TeachingService,
    private readonly assessmentService: AssessmentService,
    private readonly certificatesService: CertificatesService,
  ) {}

  /** One read-only snapshot of everything that's already "the LMS" under
   * the hood - courses/lessons (Syllabus), assignments (Teaching),
   * self-paced quizzes awaiting grading (Assessments), and course-
   * completion certificates (Certificates) - composed from each module's
   * own existing dashboard/stat method. No new queries beyond the one
   * added count on CertificatesService; nothing here is persisted. */
  async getOverview(tenantId: string, schoolSlug: string, academicYear: string | undefined, requestingUser?: ScopedUser) {
    const [syllabusDashboard, teachingStats, pendingQuizReviews, courseCompletionCertCount] = await Promise.all([
      this.syllabusService.getDashboard(tenantId, academicYear),
      this.teachingService.getDashboardStats(tenantId, requestingUser),
      this.assessmentService.getQuizAttemptsPendingReview(schoolSlug, undefined, undefined, requestingUser),
      this.certificatesService.countIssuedByType(schoolSlug, 'course_completion'),
    ]);

    return {
      courses: {
        published: syllabusDashboard.publishedCourseCount,
        totalLessons: syllabusDashboard.totalLessonsAuthored,
        draft: syllabusDashboard.draftCount,
        totalSyllabi: syllabusDashboard.totalSyllabi,
      },
      assignments: {
        total: teachingStats.totalAssignments,
        overdue: teachingStats.overdueAssignments,
      },
      quizzes: {
        pendingReview: pendingQuizReviews.length,
      },
      certificates: {
        issued: courseCompletionCertCount,
      },
    };
  }
}
