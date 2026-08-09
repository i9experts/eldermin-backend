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
    ]),
  ],
  controllers: [TeachingController],
  providers: [TeachingService],
  exports: [TeachingService],
})
export class TeachingModule {}
