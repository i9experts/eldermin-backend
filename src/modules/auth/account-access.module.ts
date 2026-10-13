import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../organization/schemas/user.schema';
import { Tenant, TenantSchema } from '../organization/schemas/tenant.schema';
import { AuditLog, AuditLogSchema } from '../../compliance/schemas/compliance.schema';
import { AuditLogModule } from '../../common/audit-log.module';
import { AuthStateModule } from './auth-state.module';
import { AccountAccessService } from './account-access.service';

/** Self-contained so HrModule / others can import it without touching AuthModule. */
@Module({
  imports: [
    AuditLogModule,
    AuthStateModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Tenant.name, schema: TenantSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
    ]),
  ],
  providers: [AccountAccessService],
  exports: [AccountAccessService],
})
export class AccountAccessModule {}
