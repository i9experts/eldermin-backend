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

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Assessment.name, schema: AssessmentSchema },
      { name: Question.name, schema: QuestionSchema },
      { name: MarkEntry.name, schema: MarkEntrySchema },
      { name: ReportCard.name, schema: ReportCardSchema },
    ]),
  ],
  controllers: [AssessmentController],
  providers: [AssessmentService],
  exports: [AssessmentService],
})
export class AssessmentModule {}
