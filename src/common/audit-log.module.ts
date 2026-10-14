import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditLog, AuditLogSchema } from '../compliance/schemas/compliance.schema';
import { AuditLogInterceptor } from './interceptors/audit-log.interceptor';
import { CriticalAuditService } from './critical-audit.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: AuditLog.name, schema: AuditLogSchema }]),
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
    CriticalAuditService,
  ],
  exports: [CriticalAuditService],
})
export class AuditLogModule {}
