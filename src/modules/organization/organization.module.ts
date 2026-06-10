import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { Institution, InstitutionSchema } from './schemas/institution.schema';
import { Campus, CampusSchema } from './schemas/campus.schema';
import { AcademicYear, AcademicYearSchema } from './schemas/academic-year.schema';
import { Department, DepartmentSchema } from './schemas/department.schema';
import { Committee, CommitteeSchema } from './schemas/committee.schema';
import { BoardMember, BoardMemberSchema } from './schemas/board-member.schema';
import { Policy, PolicySchema } from './schemas/policy.schema';
import { Meeting, MeetingSchema } from './schemas/meeting.schema';
import { ApprovalRequest, ApprovalRequestSchema } from './schemas/approval-request.schema';
import { Tenant, TenantSchema } from './schemas/tenant.schema';
import { User, UserSchema } from './schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Institution.name, schema: InstitutionSchema },
      { name: Campus.name, schema: CampusSchema },
      { name: AcademicYear.name, schema: AcademicYearSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: Committee.name, schema: CommitteeSchema },
      { name: BoardMember.name, schema: BoardMemberSchema },
      { name: Policy.name, schema: PolicySchema },
      { name: Meeting.name, schema: MeetingSchema },
      { name: ApprovalRequest.name, schema: ApprovalRequestSchema },
      { name: Tenant.name, schema: TenantSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [OrganizationController],
  providers: [OrganizationService],
  exports: [OrganizationService],
})
export class OrganizationModule {}
