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
import { ElectiveGroup, ElectiveGroupSchema } from './schemas/elective-group.schema';
import { DutyRoster, DutyRosterSchema } from './schemas/duty-roster.schema';
import { TimetableVariant, TimetableVariantSchema } from './schemas/timetable-variant.schema';
import { ExamSession, ExamSessionSchema } from './schemas/exam-session.schema';
import { Staff, StaffSchema } from '../hr/schemas/staff.schema';
import { Student, StudentSchema } from '../students/schemas/student.schema';
import { EmailModule } from '../../email/email.module';
import { PdfModule } from '../../pdf/pdf.module';
import { SubstitutionService } from './substitution.service';
import { SubstitutionController } from './substitution.controller';
import { PTMService } from './ptm.service';
import { PTMController } from './ptm.controller';
import { TimetableSolverService } from './timetable-solver.service';
import { TimetableVariantService } from './timetable-variant.service';
import { TimetableVariantController } from './timetable-variant.controller';
import { ExamService } from './exam.service';
import { ExamController } from './exam.controller';

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
      { name: ElectiveGroup.name, schema: ElectiveGroupSchema },
      { name: DutyRoster.name, schema: DutyRosterSchema },
      { name: TimetableVariant.name, schema: TimetableVariantSchema },
      { name: ExamSession.name, schema: ExamSessionSchema },
      { name: Staff.name, schema: StaffSchema },
      { name: Student.name, schema: StudentSchema },
    ]),
    EmailModule,
    PdfModule,
  ],
  controllers: [TeachingController, SubstitutionController, PTMController, TimetableVariantController, ExamController],
  providers: [TeachingService, SubstitutionService, PTMService, TimetableSolverService, TimetableVariantService, ExamService],
  exports: [TeachingService, SubstitutionService, PTMService],
})
export class TeachingModule {}
