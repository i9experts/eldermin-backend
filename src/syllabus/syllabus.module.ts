import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Syllabus, SyllabusSchema } from './schemas/syllabus.schema';
import { SloTemplate, SloTemplateSchema } from './schemas/slo-template.schema';
import { AcademicYear, AcademicYearSchema } from '../organization/schemas/organization.schema';
import { Assignment, AssignmentSchema } from '../modules/teaching/schemas/assignment.schema';
import { SyllabusService } from './syllabus.service';
import { SyllabusController } from './syllabus.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Syllabus.name, schema: SyllabusSchema },
      { name: SloTemplate.name, schema: SloTemplateSchema },
      // Registered directly (not via importing the whole
      // OrganizationModule) specifically to avoid pulling in that
      // module's own transitive dependency graph - this only needs
      // read access to real term start/end dates to compute which real
      // calendar week a sub-topic falls in, nothing else.
      { name: AcademicYear.name, schema: AcademicYearSchema },
      // Same reasoning - only needs to upsert a lesson's auto-spawned
      // Assignment row (see addLesson/updateLesson), not the whole
      // Teaching module's dependency graph.
      { name: Assignment.name, schema: AssignmentSchema },
    ]),
  ],
  controllers: [SyllabusController],
  providers: [SyllabusService],
  exports: [SyllabusService],
})
export class SyllabusModule {}
