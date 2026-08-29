import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { APP_GUARD } from '@nestjs/core';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { Role, RoleSchema } from './schemas/role.schema';
import { User, UserSchema } from '../modules/organization/schemas/user.schema';
import { CustomRoleGuard } from './guards/custom-role.guard';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Role.name, schema: RoleSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [RolesController],
  providers: [
    RolesService,
    CustomRoleGuard,
    // Registered here (rather than app.module.ts) so it can be constructed
    // with the Role/User models already scoped to this module - NestJS
    // recognizes APP_GUARD as a global-guard token regardless of which
    // module provides it. See CustomRoleGuard for why this is safe to run
    // globally: it is a no-op for every route/user not explicitly opted
    // into the custom-role system.
    { provide: APP_GUARD, useExisting: CustomRoleGuard },
  ],
  exports: [RolesService],
})
export class RolesModule {}
