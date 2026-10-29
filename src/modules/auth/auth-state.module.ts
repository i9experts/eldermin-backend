import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../organization/schemas/user.schema';
import { Tenant, TenantSchema } from '../organization/schemas/tenant.schema';
import { Staff, StaffSchema } from '../hr/schemas/staff.schema';
import { Campus, CampusSchema } from '../../organization/schemas/organization.schema';
import { TeacherProfile, TeacherProfileSchema } from '../teaching/schemas/teacher-profile.schema';
import { AuthStateService } from './auth-state.service';

/** Self-contained so AuthModule, AccountAccessModule and HrModule share ONE cache instance. */
@Module({
  imports: [MongooseModule.forFeature([
    { name: User.name, schema: UserSchema },
    { name: Tenant.name, schema: TenantSchema },
    { name: Staff.name, schema: StaffSchema },
    { name: Campus.name, schema: CampusSchema },
    { name: TeacherProfile.name, schema: TeacherProfileSchema },
  ])],
  providers: [AuthStateService],
  exports: [AuthStateService],
})
export class AuthStateModule {}
