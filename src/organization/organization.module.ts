import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { InstitutionSetupController } from './institution-setup.controller';
import { InstitutionSetupService } from './institution-setup.service';
import {
  School, SchoolSchema,
  Campus, CampusSchema,
  Cluster, ClusterSchema,
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
  AuthorityDelegation, AuthorityDelegationSchema,
} from './schemas/institution-setup.schema';
import { GroupInstitution, GroupInstitutionSchema } from './schemas/group-institution.schema';
import { Student, StudentSchema } from '../students/schemas/student.schema';
import { StudentAttendance, StudentAttendanceSchema, StudentFee, StudentFeeSchema } from '../students/schemas/student-supporting.schema';
import { Staff, StaffSchema } from '../modules/hr/schemas/staff.schema';
import { TeacherProfile, TeacherProfileSchema } from '../modules/teaching/schemas/teacher-profile.schema';
import { UploadModule } from '../upload/upload.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    UploadModule,
    EmailModule,
    MongooseModule.forFeature([
      { name: School.name, schema: SchoolSchema },
      { name: Campus.name, schema: CampusSchema },
      { name: Cluster.name, schema: ClusterSchema },
      { name: AcademicYear.name, schema: AcademicYearSchema },
      { name: Grade.name, schema: GradeSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: Designation.name, schema: DesignationSchema },
      { name: BoardMember.name, schema: BoardMemberSchema },
      { name: Committee.name, schema: CommitteeSchema },
      { name: Meeting.name, schema: MeetingSchema },
      { name: Workflow.name, schema: WorkflowSchema },
      { name: AuthorityDelegation.name, schema: AuthorityDelegationSchema },
      { name: GroupInstitution.name, schema: GroupInstitutionSchema },
      { name: Student.name, schema: StudentSchema },
      { name: StudentAttendance.name, schema: StudentAttendanceSchema },
      { name: StudentFee.name, schema: StudentFeeSchema },
      { name: Staff.name, schema: StaffSchema },
      { name: TeacherProfile.name, schema: TeacherProfileSchema },
    ]),
  ],
  controllers: [OrganizationController, InstitutionSetupController],
  providers: [OrganizationService, InstitutionSetupService],
  exports: [OrganizationService, InstitutionSetupService],
})
export class OrganizationModule {}
