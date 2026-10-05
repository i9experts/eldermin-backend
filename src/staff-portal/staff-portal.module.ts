import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StaffPortalController } from './staff-portal.controller';
import { StaffPortalService } from './staff-portal.service';
import { StaffNotifier } from './staff-notifier.service';
import { User, UserSchema } from '../modules/organization/schemas/user.schema';
import { Tenant, TenantSchema } from '../modules/organization/schemas/tenant.schema';
import { Staff, StaffSchema } from '../modules/hr/schemas/staff.schema';
import { Campus, CampusSchema } from '../organization/schemas/organization.schema';
import { TeacherProfile, TeacherProfileSchema } from '../modules/teaching/schemas/teacher-profile.schema';
import { Student, StudentSchema } from '../students/schemas/student.schema';
import { StudentLeave, StudentLeaveSchema } from '../parent-portal/schemas/consent-and-leave.schema';
import {
  Notification, NotificationSchema, MessageThread, MessageThreadSchema, Message, MessageSchema,
} from '../parent-portal/schemas/notification-and-message.schema';
import {
  StaffDeviceToken, StaffDeviceTokenSchema, StaffDeletionRequest, StaffDeletionRequestSchema,
} from './schemas/staff-portal.schema';
import { Assignment, AssignmentSchema } from '../modules/teaching/schemas/assignment.schema';
import { Timetable, TimetableSchema } from '../modules/teaching/schemas/timetable.schema';
import { StaffTeachingService } from './staff-teaching.service';
import { RolesModule } from '../roles/roles.module';

@Module({
  imports: [
    RolesModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Tenant.name, schema: TenantSchema },
      { name: Staff.name, schema: StaffSchema },
      { name: Campus.name, schema: CampusSchema },
      { name: TeacherProfile.name, schema: TeacherProfileSchema },
      { name: Student.name, schema: StudentSchema },
      { name: StudentLeave.name, schema: StudentLeaveSchema },
      { name: Notification.name, schema: NotificationSchema },
      { name: MessageThread.name, schema: MessageThreadSchema },
      { name: Message.name, schema: MessageSchema },
      { name: StaffDeviceToken.name, schema: StaffDeviceTokenSchema },
      { name: StaffDeletionRequest.name, schema: StaffDeletionRequestSchema },
      { name: Assignment.name, schema: AssignmentSchema },
      { name: Timetable.name, schema: TimetableSchema },
    ]),
  ],
  controllers: [StaffPortalController],
  providers: [StaffPortalService, StaffTeachingService, StaffNotifier],
  exports: [StaffNotifier],
})
export class StaffPortalModule {}
