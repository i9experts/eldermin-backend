import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HrController } from './hr.controller';
import { HrService } from './hr.service';
import { Staff, StaffSchema } from './schemas/staff.schema';
import { Designation, DesignationSchema } from './schemas/designation.schema';
import { LeaveApplication, LeaveApplicationSchema } from './schemas/leave-application.schema';
import { StaffLifecycle, StaffLifecycleSchema } from './schemas/staff-lifecycle.schema';
import { JobOpening, JobOpeningSchema } from './schemas/job-opening.schema';
import { JobApplication, JobApplicationSchema } from './schemas/job-application.schema';
import { InterviewSchedule, InterviewScheduleSchema } from './schemas/interview-schedule.schema';
import { StaffAttendance, StaffAttendanceSchema } from './schemas/staff-attendance.schema';
import { LeaveBalance, LeaveBalanceSchema } from './schemas/leave-balance.schema';
import { PayrollRun, PayrollRunSchema } from './schemas/payroll-run.schema';
import { Payslip, PayslipSchema } from './schemas/payslip.schema';
import { PerformanceReview, PerformanceReviewSchema } from './schemas/performance-review.schema';
import { Training, TrainingSchema } from './schemas/training.schema';
import { StaffContract, StaffContractSchema } from './schemas/staff-contract.schema';
import { ExitRecord, ExitRecordSchema } from './schemas/exit-record.schema';
import { LeavePolicy, LeavePolicySchema } from './schemas/leave-policy.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Staff.name, schema: StaffSchema },
      { name: Designation.name, schema: DesignationSchema },
      { name: LeaveApplication.name, schema: LeaveApplicationSchema },
      { name: StaffLifecycle.name, schema: StaffLifecycleSchema },
      { name: JobOpening.name, schema: JobOpeningSchema },
      { name: JobApplication.name, schema: JobApplicationSchema },
      { name: InterviewSchedule.name, schema: InterviewScheduleSchema },
      { name: StaffAttendance.name, schema: StaffAttendanceSchema },
      { name: LeaveBalance.name, schema: LeaveBalanceSchema },
      { name: PayrollRun.name, schema: PayrollRunSchema },
      { name: Payslip.name, schema: PayslipSchema },
      { name: PerformanceReview.name, schema: PerformanceReviewSchema },
      { name: Training.name, schema: TrainingSchema },
      { name: StaffContract.name, schema: StaffContractSchema },
      { name: ExitRecord.name, schema: ExitRecordSchema },
      { name: LeavePolicy.name, schema: LeavePolicySchema },
    ]),
  ],
  controllers: [HrController],
  providers: [HrService],
  exports: [HrService],
})
export class HrModule {}
