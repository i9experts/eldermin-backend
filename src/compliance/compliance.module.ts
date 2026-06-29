import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Policy, PolicySchema,
  PolicyAcknowledgement, PolicyAcknowledgementSchema,
  SafeguardingCase, SafeguardingCaseSchema,
  AuditLog, AuditLogSchema,
  Accreditation, AccreditationSchema,
} from './schemas/compliance.schema';
import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Policy.name, schema: PolicySchema },
      { name: PolicyAcknowledgement.name, schema: PolicyAcknowledgementSchema },
      { name: SafeguardingCase.name, schema: SafeguardingCaseSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: Accreditation.name, schema: AccreditationSchema },
    ]),
  ],
  controllers: [ComplianceController],
  providers: [ComplianceService],
  exports: [ComplianceService],
})
export class ComplianceModule {}
