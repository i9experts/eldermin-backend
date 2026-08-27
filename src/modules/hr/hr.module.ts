import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UploadModule } from '../../upload/upload.module';
import { FinanceModule } from '../../finance/finance.module';
import { EmailModule } from '../../email/email.module';
import { PdfModule } from '../../pdf/pdf.module';
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
import { PayrollPayment, PayrollPaymentSchema } from './schemas/payroll-payment.schema';
import { BankAccount, BankAccountSchema } from '../../finance/schemas/finance.schema';
import { SalaryComponent, SalaryComponentSchema } from './schemas/salary-component.schema';
import { SalaryTemplate, SalaryTemplateSchema } from './schemas/salary-template.schema';
import { PerformanceReview, PerformanceReviewSchema } from './schemas/performance-review.schema';
import { Training, TrainingSchema } from './schemas/training.schema';
import { StaffContract, StaffContractSchema } from './schemas/staff-contract.schema';
import { ContractTemplate, ContractTemplateSchema } from './schemas/contract-template.schema';
import { OfferLetter, OfferLetterSchema } from './schemas/offer-letter.schema';
import { OfferLetterTemplate, OfferLetterTemplateSchema } from './schemas/offer-letter-template.schema';
import { AppointmentLetter, AppointmentLetterSchema } from './schemas/appointment-letter.schema';
import { ExitRecord, ExitRecordSchema } from './schemas/exit-record.schema';
import { LeavePolicy, LeavePolicySchema } from './schemas/leave-policy.schema';
import { BiometricConfig, BiometricConfigSchema } from './schemas/biometric-config.schema';
import { Holiday, HolidaySchema } from './schemas/holiday.schema';
import { ExitSettings, ExitSettingsSchema } from './schemas/exit-settings.schema';
import { HiringSettings, HiringSettingsSchema } from './schemas/hiring-settings.schema';
import { AttendanceSettings, AttendanceSettingsSchema } from './schemas/attendance-settings.schema';
import { Shift, ShiftSchema } from './schemas/shift.schema';
import { Grievance, GrievanceSchema } from './schemas/grievance.schema';
import { DailyWorkSummary, DailyWorkSummarySchema } from './schemas/daily-work-summary.schema';
import { ExpenseClaim, ExpenseClaimSchema } from './schemas/expense-claim.schema';
import { Advance, AdvanceSchema } from './schemas/advance.schema';
import { User, UserSchema } from '../organization/schemas/user.schema';
import { School, SchoolSchema } from '../../organization/schemas/organization.schema';

@Module({
  imports: [
    UploadModule,
    FinanceModule,
    EmailModule,
    PdfModule,
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
      { name: PayrollPayment.name, schema: PayrollPaymentSchema },
      { name: BankAccount.name, schema: BankAccountSchema },
      { name: SalaryComponent.name, schema: SalaryComponentSchema },
      { name: SalaryTemplate.name, schema: SalaryTemplateSchema },
      { name: PerformanceReview.name, schema: PerformanceReviewSchema },
      { name: Training.name, schema: TrainingSchema },
      { name: StaffContract.name, schema: StaffContractSchema },
      { name: ContractTemplate.name, schema: ContractTemplateSchema },
      { name: OfferLetter.name, schema: OfferLetterSchema },
      { name: OfferLetterTemplate.name, schema: OfferLetterTemplateSchema },
      { name: AppointmentLetter.name, schema: AppointmentLetterSchema },
      { name: ExitRecord.name, schema: ExitRecordSchema },
      { name: LeavePolicy.name, schema: LeavePolicySchema },
      { name: BiometricConfig.name, schema: BiometricConfigSchema },
      { name: Holiday.name, schema: HolidaySchema },
      { name: ExitSettings.name, schema: ExitSettingsSchema },
      { name: HiringSettings.name, schema: HiringSettingsSchema },
      { name: AttendanceSettings.name, schema: AttendanceSettingsSchema },
      { name: Shift.name, schema: ShiftSchema },
      { name: Grievance.name, schema: GrievanceSchema },
      { name: DailyWorkSummary.name, schema: DailyWorkSummarySchema },
      { name: ExpenseClaim.name, schema: ExpenseClaimSchema },
      { name: Advance.name, schema: AdvanceSchema },
      { name: User.name, schema: UserSchema },
      { name: School.name, schema: SchoolSchema },
    ]),
  ],
  controllers: [HrController],
  providers: [HrService],
  exports: [HrService],
})
export class HrModule {}
