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
} from './schemas/compliance.schema';
import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';
import { UploadModule } from '../upload/upload.module';

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
    ]),
  ],
  controllers: [ComplianceController],
  providers: [ComplianceService],
  exports: [ComplianceService],
})
export class ComplianceModule {}
