import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Syllabus, SyllabusSchema } from './schemas/syllabus.schema';
import { SloTemplate, SloTemplateSchema } from './schemas/slo-template.schema';
import { CourseEnrollment, CourseEnrollmentSchema } from './schemas/course-enrollment.schema';
import { ForumThread, ForumThreadSchema } from './schemas/forum-thread.schema';
import { ForumReply, ForumReplySchema } from './schemas/forum-reply.schema';
import { Student, StudentSchema } from '../students/schemas/student.schema';
import { ForumService } from './forum.service';
import { AcademicYear, AcademicYearSchema } from '../organization/schemas/organization.schema';
import { Assignment, AssignmentSchema } from '../modules/teaching/schemas/assignment.schema';
import { Staff, StaffSchema } from '../modules/hr/schemas/staff.schema';
import { TeacherProfile, TeacherProfileSchema } from '../modules/teaching/schemas/teacher-profile.schema';
import { SyllabusService } from './syllabus.service';
import { SyllabusController } from './syllabus.controller';
import { GamificationModule } from '../gamification/gamification.module';

@Module({
  imports: [
    GamificationModule,
    MongooseModule.forFeature([
      { name: Syllabus.name, schema: SyllabusSchema },
      { name: SloTemplate.name, schema: SloTemplateSchema },
      // Registered directly (not via importing the whole
      // OrganizationModule) specifically to avoid pulling in that
      // module's own transitive dependency graph - this only needs
      // read access to real term start/end dates to compute which real
      // calendar week a sub-topic falls in, nothing else.
      { name: AcademicYear.name, schema: AcademicYearSchema },
      // Same reasoning - only needs to upsert a lesson's auto-spawned
      // Assignment row (see addLesson/updateLesson), not the whole
      // Teaching module's dependency graph.
      { name: Assignment.name, schema: AssignmentSchema },
      // Needed to resolve a TEACHER caller's own Staff._id (never trusted
      // from the JWT) so their own syllabi can be scoped to themselves -
      // same resolveTeacherIdentity() pattern the Teaching module uses.
      { name: Staff.name, schema: StaffSchema },
      { name: TeacherProfile.name, schema: TeacherProfileSchema },
      { name: CourseEnrollment.name, schema: CourseEnrollmentSchema },
      // Only needed to validate a student id exists (and belongs to this
      // school) before enrolling them, and to denormalize their name onto
      // the enrollment row - same minimal-registration reasoning as Staff/
      // TeacherProfile above, not the whole Students module's graph.
      { name: Student.name, schema: StudentSchema },
      { name: ForumThread.name, schema: ForumThreadSchema },
      { name: ForumReply.name, schema: ForumReplySchema },
    ]),
  ],
  controllers: [SyllabusController],
  providers: [SyllabusService, ForumService],
  exports: [SyllabusService, ForumService],
})
export class SyllabusModule {}
