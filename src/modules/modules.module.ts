import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SchoolSchema } from '../organization/schemas/organization.schema';
import { Tenant, TenantSchema } from './organization/schemas/tenant.schema';
import {
  Institution, InstitutionSchema,
  SubscriptionHistory, SubscriptionHistorySchema,
} from '../super-admin/schemas/super-admin.schema';
import { ModulesController } from './modules.controller';
import { ModulesService } from './modules.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'School', schema: SchoolSchema },
      // Login signs activeModules from Tenant, not School (see
      // ModulesService.syncAcrossCollections) - both need to move
      // together or a school's real module access and this dashboard's
      // display of it silently drift apart, which is exactly what was
      // happening before this fix.
      { name: Tenant.name, schema: TenantSchema },
      // Super Admin's own billing/tracking record - kept in sync so
      // monthlyRevenue always reflects the modules actually active,
      // not a stale flat plan fee set once at signup.
      { name: Institution.name, schema: InstitutionSchema },
      { name: SubscriptionHistory.name, schema: SubscriptionHistorySchema },
    ]),
  ],
  controllers: [ModulesController],
  providers: [ModulesService],
  exports: [ModulesService],
})
export class ModulesModule {}
