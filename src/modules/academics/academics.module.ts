import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AcademicsController } from './academics.controller';
import { AcademicsService } from './academics.service';
import { Subject, SubjectSchema } from './schemas/subject.schema';
import { SubjectCategory, SubjectCategorySchema } from './schemas/subject-category.schema';
import { SubjectGroup, SubjectGroupSchema } from './schemas/subject-group.schema';
import { Curriculum, CurriculumSchema } from './schemas/curriculum.schema';
import { Syllabus, SyllabusSchema } from '../../syllabus/schemas/syllabus.schema';
import { Book, BookSchema } from './schemas/book.schema';
import { BookIssue, BookIssueSchema } from './schemas/book-issue.schema';
import { LibrarySettings, LibrarySettingsSchema } from './schemas/library-settings.schema';
import { Reservation, ReservationSchema } from './schemas/reservation.schema';
import { Timetable, TimetableSchema } from '../teaching/schemas/timetable.schema';
import { ElectiveGroup, ElectiveGroupSchema } from '../teaching/schemas/elective-group.schema';
import { Student, StudentSchema } from '../../students/schemas/student.schema';
import { Staff, StaffSchema } from '../hr/schemas/staff.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Subject.name,   schema: SubjectSchema   },
      { name: SubjectCategory.name, schema: SubjectCategorySchema },
      { name: SubjectGroup.name, schema: SubjectGroupSchema },
      { name: Curriculum.name, schema: CurriculumSchema },
      { name: Syllabus.name,  schema: SyllabusSchema  },
      { name: Book.name,      schema: BookSchema      },
      { name: BookIssue.name, schema: BookIssueSchema },
      { name: LibrarySettings.name, schema: LibrarySettingsSchema },
      { name: Reservation.name, schema: ReservationSchema },
      // Registered here too (same pattern as ParentPortalModule) purely so
      // AcademicsService can read them for the subject-delete reference
      // check - Teaching remains the sole owner of these collections.
      { name: Timetable.name, schema: TimetableSchema },
      { name: ElectiveGroup.name, schema: ElectiveGroupSchema },
      // Read-only cross-module reads (same pattern as Timetable/
      // ElectiveGroup above, and as pdf.module.ts reading Finance schemas
      // directly) so library issue/reservation can resolve a real
      // borrowerId server-side without importing the whole
      // StudentsModule/HrModule and risking a circular module dependency.
      // StudentsModule/HrModule remain the sole owners of these
      // collections.
      { name: Student.name, schema: StudentSchema },
      { name: Staff.name, schema: StaffSchema },
    ]),
  ],
  controllers: [AcademicsController],
  providers:   [AcademicsService],
  exports:     [AcademicsService],
})
export class AcademicsModule {}
