import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import {
  School, SchoolSchema,
  Campus, CampusSchema,
  AcademicYear, AcademicYearSchema,
  Grade, GradeSchema,
  Department, DepartmentSchema,
  Designation, DesignationSchema,
} from './schemas/organization.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: School.name, schema: SchoolSchema },
      { name: Campus.name, schema: CampusSchema },
      { name: AcademicYear.name, schema: AcademicYearSchema },
      { name: Grade.name, schema: GradeSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: Designation.name, schema: DesignationSchema },
    ]),
  ],
  controllers: [OrganizationController],
  providers: [OrganizationService],
  exports: [OrganizationService],
})
export class OrganizationModule {}
