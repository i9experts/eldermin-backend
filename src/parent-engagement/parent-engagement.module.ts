import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ParentEngagementController } from './parent-engagement.controller';
import { ParentEngagementService } from './parent-engagement.service';
import { PickupLog, PickupLogSchema } from './schemas/pickup-log.schema';
import { Student, StudentSchema } from '../students/schemas/student.schema';
import { StudentAttendance, StudentAttendanceSchema } from '../students/schemas/student-supporting.schema';
import { StudentLeave, StudentLeaveSchema } from '../parent-portal/schemas/consent-and-leave.schema';
import { Invoice, InvoiceSchema, Payment, PaymentSchema } from '../finance/schemas/finance.schema';
import { Circular, CircularSchema } from '../school-calendar/schemas/circular.schema';
import { CircularAcknowledgment, CircularAcknowledgmentSchema } from '../school-calendar/schemas/circular-acknowledgment.schema';
import { User, UserSchema } from '../modules/organization/schemas/user.schema';
import { HomeTask, HomeTaskSchema } from '../home-tasks/schemas/home-task.schema';
import { HygieneCheck, HygieneCheckSchema } from '../hygiene/schemas/hygiene-check.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PickupLog.name, schema: PickupLogSchema },
      { name: Student.name, schema: StudentSchema },
      { name: StudentAttendance.name, schema: StudentAttendanceSchema },
      { name: StudentLeave.name, schema: StudentLeaveSchema },
      { name: Invoice.name, schema: InvoiceSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: Circular.name, schema: CircularSchema },
      { name: CircularAcknowledgment.name, schema: CircularAcknowledgmentSchema },
      { name: User.name, schema: UserSchema },
      { name: HomeTask.name, schema: HomeTaskSchema },
      { name: HygieneCheck.name, schema: HygieneCheckSchema },
    ]),
  ],
  controllers: [ParentEngagementController],
  providers: [ParentEngagementService],
  exports: [ParentEngagementService],
})
export class ParentEngagementModule {}
