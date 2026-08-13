import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ParentPortalController } from './parent-portal.controller';
import { ParentPortalService } from './parent-portal.service';
import { Student, StudentSchema } from '../students/schemas/student.schema';
import { StudentAttendance, StudentAttendanceSchema } from '../students/schemas/student-supporting.schema';
import { Invoice, InvoiceSchema } from '../finance/schemas/finance.schema';
import { MarkEntry, MarkEntrySchema, ReportCard, ReportCardSchema } from '../assessments/schemas/assessment.schema';
import { BehaviourRecord, BehaviourRecordSchema, TarbiyahAssessment, TarbiyahAssessmentSchema } from '../behaviour/schemas/behaviour.schema';
import { Timetable, TimetableSchema } from '../modules/teaching/schemas/timetable.schema';
import { Assignment, AssignmentSchema } from '../modules/teaching/schemas/assignment.schema';
import { Book, BookSchema } from '../modules/academics/schemas/book.schema';
import { BookIssue, BookIssueSchema } from '../modules/academics/schemas/book-issue.schema';
import { DocumentRecord, DocumentRecordSchema } from '../documents/schemas/documents.schema';
import { SchoolEvent, SchoolEventSchema } from '../campus/campus.schema';
import { PTMMeeting, PTMMeetingSchema } from '../modules/teaching/schemas/ptm-meeting.schema';
import { User, UserSchema } from '../modules/organization/schemas/user.schema';
import {
  ConsentRequest, ConsentRequestSchema,
  ConsentResponse, ConsentResponseSchema,
  StudentLeave, StudentLeaveSchema,
} from './schemas/consent-and-leave.schema';
import {
  Notification, NotificationSchema,
  MessageThread, MessageThreadSchema,
  Message, MessageSchema,
} from './schemas/notification-and-message.schema';
import { PhoneOtp, PhoneOtpSchema } from './schemas/phone-otp.schema';
import { Tenant, TenantSchema } from '../modules/organization/schemas/tenant.schema';
import { EmailModule } from '../email/email.module';
import { ParentAuthService } from './parent-auth.service';
import { ParentAuthController } from './parent-auth.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Student.name, schema: StudentSchema },
      { name: StudentAttendance.name, schema: StudentAttendanceSchema },
      { name: Invoice.name, schema: InvoiceSchema },
      { name: MarkEntry.name, schema: MarkEntrySchema },
      { name: ReportCard.name, schema: ReportCardSchema },
      { name: BehaviourRecord.name, schema: BehaviourRecordSchema },
      { name: TarbiyahAssessment.name, schema: TarbiyahAssessmentSchema },
      { name: Timetable.name, schema: TimetableSchema },
      { name: Assignment.name, schema: AssignmentSchema },
      { name: Book.name, schema: BookSchema },
      { name: BookIssue.name, schema: BookIssueSchema },
      { name: DocumentRecord.name, schema: DocumentRecordSchema },
      { name: SchoolEvent.name, schema: SchoolEventSchema },
      { name: PTMMeeting.name, schema: PTMMeetingSchema },
      { name: User.name, schema: UserSchema },
      { name: ConsentRequest.name, schema: ConsentRequestSchema },
      { name: ConsentResponse.name, schema: ConsentResponseSchema },
      { name: StudentLeave.name, schema: StudentLeaveSchema },
      { name: Notification.name, schema: NotificationSchema },
      { name: MessageThread.name, schema: MessageThreadSchema },
      { name: Message.name, schema: MessageSchema },
      { name: PhoneOtp.name, schema: PhoneOtpSchema },
      { name: Tenant.name, schema: TenantSchema },
    ]),
    EmailModule,
  ],
  controllers: [ParentPortalController, ParentAuthController],
  providers: [ParentPortalService, ParentAuthService],
  exports: [ParentPortalService, ParentAuthService],
})
export class ParentPortalModule {}
