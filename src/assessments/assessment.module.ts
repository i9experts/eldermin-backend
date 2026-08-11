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
import { Student, StudentSchema } from '../students/schemas/student.schema';
import { PdfModule } from '../pdf/pdf.module';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [
    PdfModule,
    UploadModule,
    MongooseModule.forFeature([
      { name: Assessment.name, schema: AssessmentSchema },
      { name: Question.name, schema: QuestionSchema },
      { name: MarkEntry.name, schema: MarkEntrySchema },
      { name: ReportCard.name, schema: ReportCardSchema },
      { name: ExamPaper.name, schema: ExamPaperSchema },
      { name: OMRAnswerSheet.name, schema: OMRAnswerSheetSchema },
      { name: Student.name, schema: StudentSchema },
    ]),
  ],
  controllers: [AssessmentController],
  providers: [AssessmentService],
  exports: [AssessmentService],
})
export class AssessmentModule {}
