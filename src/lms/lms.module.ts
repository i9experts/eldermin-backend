import { Module } from '@nestjs/common';
import { SyllabusModule } from '../syllabus/syllabus.module';
import { TeachingModule } from '../modules/teaching/teaching.module';
import { AssessmentModule } from '../assessments/assessment.module';
import { CertificatesModule } from '../modules/certificates/certificates.module';
import { LmsService } from './lms.service';
import { LmsController } from './lms.controller';

// Phase 0 of the LMS unification effort: what the product already does -
// course content + progress (Syllabus), self-paced online quizzes
// (Assessments), homework/assignment submissions + grading (Teaching),
// and auto-issued course-completion certificates (Certificates) - has
// never been surfaced as a single named "LMS" area; each lives inside its
// own module with no shared view. This module adds nothing new to the
// data model: it's a read-only aggregator composing the existing
// services' own dashboard/stat methods into one overview, so a school can
// see "our LMS" as a coherent whole instead of three unrelated screens.
@Module({
  imports: [SyllabusModule, TeachingModule, AssessmentModule, CertificatesModule],
  controllers: [LmsController],
  providers: [LmsService],
})
export class LmsModule {}
