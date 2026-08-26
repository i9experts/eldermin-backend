import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TeachingController } from './teaching.controller';
import { TeachingService } from './teaching.service';
import { TeacherProfile, TeacherProfileSchema } from './schemas/teacher-profile.schema';
import { LessonPlan, LessonPlanSchema } from './schemas/lesson-plan.schema';
import { Timetable, TimetableSchema } from './schemas/timetable.schema';
import { Room, RoomSchema } from './schemas/room.schema';
import { PeriodTemplate, PeriodTemplateSchema } from './schemas/period-template.schema';
import { Assignment, AssignmentSchema } from './schemas/assignment.schema';
import { BehaviourNote, BehaviourNoteSchema } from './schemas/behaviour-note.schema';
import { Substitution, SubstitutionSchema } from './schemas/substitution.schema';
import { PTMMeeting, PTMMeetingSchema } from './schemas/ptm-meeting.schema';
import { Staff, StaffSchema } from '../hr/schemas/staff.schema';
import { Student, StudentSchema } from '../students/schemas/student.schema';
import { EmailModule } from '../../email/email.module';
import { PdfModule } from '../../pdf/pdf.module';
import { SubstitutionService } from './substitution.service';
import { SubstitutionController } from './substitution.controller';
import { PTMService } from './ptm.service';
import { PTMController } from './ptm.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TeacherProfile.name, schema: TeacherProfileSchema },
      { name: LessonPlan.name, schema: LessonPlanSchema },
      { name: Timetable.name, schema: TimetableSchema },
      { name: Room.name, schema: RoomSchema },
      { name: PeriodTemplate.name, schema: PeriodTemplateSchema },
      { name: Assignment.name, schema: AssignmentSchema },
      { name: BehaviourNote.name, schema: BehaviourNoteSchema },
      { name: Substitution.name, schema: SubstitutionSchema },
      { name: PTMMeeting.name, schema: PTMMeetingSchema },
      { name: Staff.name, schema: StaffSchema },
      { name: Student.name, schema: StudentSchema },
    ]),
    EmailModule,
    PdfModule,
  ],
  controllers: [TeachingController, SubstitutionController, PTMController],
  providers: [TeachingService, SubstitutionService, PTMService],
  exports: [TeachingService, SubstitutionService, PTMService],
})
export class TeachingModule {}
