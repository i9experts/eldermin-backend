import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AssessmentController } from './assessment.controller';
import { AssessmentService } from './assessment.service';
import {
  Assessment, AssessmentSchema,
  Question, QuestionSchema,
  MarkEntry, MarkEntrySchema,
  ReportCard, ReportCardSchema,
} from './schemas/assessment.schema';
import { ExamPaper, ExamPaperSchema } from './schemas/exam-paper.schema';
import { OMRAnswerSheet, OMRAnswerSheetSchema } from './schemas/omr-answer-sheet.schema';
import { QuizAttempt, QuizAttemptSchema } from './schemas/quiz-attempt.schema';
import { Student, StudentSchema } from '../students/schemas/student.schema';
import { SchoolSchema, Campus, CampusSchema, Grade, GradeSchema } from '../organization/schemas/organization.schema';
import { GroupInstitution, GroupInstitutionSchema } from '../organization/schemas/group-institution.schema';
import { Subject, SubjectSchema } from '../modules/academics/schemas/subject.schema';
import { Staff, StaffSchema } from '../modules/hr/schemas/staff.schema';
import { TeacherProfile, TeacherProfileSchema } from '../modules/teaching/schemas/teacher-profile.schema';
import { PdfModule } from '../pdf/pdf.module';
import { UploadModule } from '../upload/upload.module';
import { GamificationModule } from '../gamification/gamification.module';

@Module({
  imports: [
    PdfModule,
    UploadModule,
    GamificationModule,
    MongooseModule.forFeature([
      { name: Assessment.name, schema: AssessmentSchema },
      { name: Question.name, schema: QuestionSchema },
      { name: MarkEntry.name, schema: MarkEntrySchema },
      { name: ReportCard.name, schema: ReportCardSchema },
      { name: ExamPaper.name, schema: ExamPaperSchema },
      { name: OMRAnswerSheet.name, schema: OMRAnswerSheetSchema },
      { name: QuizAttempt.name, schema: QuizAttemptSchema },
      { name: Student.name, schema: StudentSchema },
      { name: 'School', schema: SchoolSchema },
      { name: Campus.name, schema: CampusSchema },
      { name: GroupInstitution.name, schema: GroupInstitutionSchema },
      { name: Grade.name, schema: GradeSchema },
      { name: Subject.name, schema: SubjectSchema },
      { name: Staff.name, schema: StaffSchema },
      { name: TeacherProfile.name, schema: TeacherProfileSchema },
    ]),
  ],
  controllers: [AssessmentController],
  providers: [AssessmentService],
  exports: [AssessmentService],
})
export class AssessmentModule {}
