import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { InstitutionSetupController } from './institution-setup.controller';
import { InstitutionSetupService } from './institution-setup.service';
import {
  School, SchoolSchema,
  Campus, CampusSchema,
  AcademicYear, AcademicYearSchema,
  Grade, GradeSchema,
  Department, DepartmentSchema,
  Designation, DesignationSchema,
} from './schemas/organization.schema';
import {
  BoardMember, BoardMemberSchema,
  Committee, CommitteeSchema,
  Meeting, MeetingSchema,
  Workflow, WorkflowSchema,
} from './schemas/institution-setup.schema';
import { GroupInstitution, GroupInstitutionSchema } from './schemas/group-institution.schema';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [
    UploadModule,
    MongooseModule.forFeature([
      { name: School.name, schema: SchoolSchema },
      { name: Campus.name, schema: CampusSchema },
      { name: AcademicYear.name, schema: AcademicYearSchema },
      { name: Grade.name, schema: GradeSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: Designation.name, schema: DesignationSchema },
      { name: BoardMember.name, schema: BoardMemberSchema },
      { name: Committee.name, schema: CommitteeSchema },
      { name: Meeting.name, schema: MeetingSchema },
      { name: Workflow.name, schema: WorkflowSchema },
      { name: GroupInstitution.name, schema: GroupInstitutionSchema },
    ]),
  ],
  controllers: [OrganizationController, InstitutionSetupController],
  providers: [OrganizationService, InstitutionSetupService],
  exports: [OrganizationService, InstitutionSetupService],
})
export class OrganizationModule {}
