import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EmailModule } from '../email/email.module';
import { SchoolCalendarController } from './school-calendar.controller';
import { SchoolCalendarService } from './school-calendar.service';
import { CalendarEvent, CalendarEventSchema } from './schemas/calendar-event.schema';
import { Circular, CircularSchema } from './schemas/circular.schema';
import { CircularAcknowledgment, CircularAcknowledgmentSchema } from './schemas/circular-acknowledgment.schema';
import { Invoice, InvoiceSchema } from '../finance/schemas/finance.schema';
import { Student, StudentSchema } from '../students/schemas/student.schema';
import { Staff, StaffSchema } from '../modules/hr/schemas/staff.schema';
import { User, UserSchema } from '../modules/organization/schemas/user.schema';
import { Tenant, TenantSchema } from '../modules/organization/schemas/tenant.schema';
import { Notification, NotificationSchema } from '../parent-portal/schemas/notification-and-message.schema';
import { Assessment, AssessmentSchema } from '../assessments/schemas/assessment.schema';
import { AcademicYear as SchoolAcademicYear, AcademicYearSchema as SchoolAcademicYearSchema } from '../organization/schemas/organization.schema';

@Module({
  imports: [
    EmailModule,
    MongooseModule.forFeature([
      { name: CalendarEvent.name, schema: CalendarEventSchema },
      { name: Circular.name, schema: CircularSchema },
      { name: CircularAcknowledgment.name, schema: CircularAcknowledgmentSchema },
      { name: Invoice.name, schema: InvoiceSchema },
      { name: Student.name, schema: StudentSchema },
      { name: Staff.name, schema: StaffSchema },
      { name: User.name, schema: UserSchema },
      { name: Tenant.name, schema: TenantSchema },
      { name: Notification.name, schema: NotificationSchema },
      { name: Assessment.name, schema: AssessmentSchema },
      { name: SchoolAcademicYear.name, schema: SchoolAcademicYearSchema },
    ]),
  ],
  controllers: [SchoolCalendarController],
  providers: [SchoolCalendarService],
  exports: [SchoolCalendarService],
})
export class SchoolCalendarModule {}
