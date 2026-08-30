import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Policy, PolicySchema,
  PolicyAcknowledgement, PolicyAcknowledgementSchema,
  SafeguardingCase, SafeguardingCaseSchema,
  AuditLog, AuditLogSchema,
  Accreditation, AccreditationSchema,
  ApprovalRequest, ApprovalRequestSchema,
  ConsentRecord, ConsentRecordSchema,
  RetentionPolicy, RetentionPolicySchema,
  DataSubjectRequest, DataSubjectRequestSchema,
  AttendanceComplianceSettings, AttendanceComplianceSettingsSchema,
} from './schemas/compliance.schema';
import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';
import { AttendanceComplianceService } from './attendance-compliance.service';
import { GovernanceRollupService } from './governance-rollup.service';
import { UploadModule } from '../upload/upload.module';
import { Campus, CampusSchema } from '../organization/schemas/organization.schema';
import { Tenant, TenantSchema } from '../modules/organization/schemas/tenant.schema';
import { Student, StudentSchema } from '../modules/students/schemas/student.schema';
import { StudentAttendance, StudentAttendanceSchema } from '../modules/students/schemas/student-attendance.schema';
import { Staff, StaffSchema } from '../modules/hr/schemas/staff.schema';
import { StaffAttendance, StaffAttendanceSchema } from '../modules/hr/schemas/staff-attendance.schema';

@Module({
  imports: [
    UploadModule,
    MongooseModule.forFeature([
      { name: Policy.name, schema: PolicySchema },
      { name: PolicyAcknowledgement.name, schema: PolicyAcknowledgementSchema },
      { name: SafeguardingCase.name, schema: SafeguardingCaseSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: Accreditation.name, schema: AccreditationSchema },
      { name: ApprovalRequest.name, schema: ApprovalRequestSchema },
      { name: ConsentRecord.name, schema: ConsentRecordSchema },
      { name: RetentionPolicy.name, schema: RetentionPolicySchema },
      { name: DataSubjectRequest.name, schema: DataSubjectRequestSchema },
      { name: AttendanceComplianceSettings.name, schema: AttendanceComplianceSettingsSchema },
      // Read-only cross-module reads, same precedent as Procurement Reports
      // reading Finance's Budget / PdfModule reading Finance's Invoice.
      { name: Campus.name, schema: CampusSchema },
      { name: Tenant.name, schema: TenantSchema },
      { name: Student.name, schema: StudentSchema },
      { name: StudentAttendance.name, schema: StudentAttendanceSchema },
      { name: Staff.name, schema: StaffSchema },
      { name: StaffAttendance.name, schema: StaffAttendanceSchema },
    ]),
  ],
  controllers: [ComplianceController],
  providers: [ComplianceService, AttendanceComplianceService, GovernanceRollupService],
  exports: [ComplianceService, AttendanceComplianceService, GovernanceRollupService],
})
export class ComplianceModule {}
