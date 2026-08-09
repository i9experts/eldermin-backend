import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AcademicsController } from './academics.controller';
import { AcademicsService } from './academics.service';
import { Subject, SubjectSchema } from './schemas/subject.schema';
import { Curriculum, CurriculumSchema } from './schemas/curriculum.schema';
import { Syllabus, SyllabusSchema } from '../../syllabus/schemas/syllabus.schema';
import { Book, BookSchema } from './schemas/book.schema';
import { BookIssue, BookIssueSchema } from './schemas/book-issue.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Subject.name,   schema: SubjectSchema   },
      { name: Curriculum.name, schema: CurriculumSchema },
      { name: Syllabus.name,  schema: SyllabusSchema  },
      { name: Book.name,      schema: BookSchema      },
      { name: BookIssue.name, schema: BookIssueSchema },
    ]),
  ],
  controllers: [AcademicsController],
  providers:   [AcademicsService],
  exports:     [AcademicsService],
})
export class AcademicsModule {}
