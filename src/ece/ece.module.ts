import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ECEFramework, ECEFrameworkSchema } from './schemas/framework.schema';
import { ECEDomain, ECEDomainSchema, ECESkill, ECESkillSchema, ECEIndicator, ECEIndicatorSchema, ECEAgeBand, ECEAgeBandSchema } from './schemas/ontology.schema';
import { ECEFrameworkMapping, ECEFrameworkMappingSchema } from './schemas/framework-mapping.schema';
import { ECEObservation, ECEObservationSchema } from './schemas/observation.schema';
import { ECEDevelopmentProfile, ECEDevelopmentProfileSchema } from './schemas/development-profile.schema';
import { ECEPortfolioEntry, ECEPortfolioEntrySchema } from './schemas/portfolio-entry.schema';
import { StudentAttendance, StudentAttendanceSchema } from '../students/schemas/student-supporting.schema';
import { Student, StudentSchema } from '../students/schemas/student.schema';
import { EmailModule } from '../email/email.module';
import { EceService } from './ece.service';
import { EceController } from './ece.controller';

@Module({
  imports: [
    EmailModule,
    MongooseModule.forFeature([
      { name: ECEFramework.name, schema: ECEFrameworkSchema },
      { name: ECEDomain.name, schema: ECEDomainSchema },
      { name: ECESkill.name, schema: ECESkillSchema },
      { name: ECEIndicator.name, schema: ECEIndicatorSchema },
      { name: ECEAgeBand.name, schema: ECEAgeBandSchema },
      { name: ECEFrameworkMapping.name, schema: ECEFrameworkMappingSchema },
      { name: ECEObservation.name, schema: ECEObservationSchema },
      { name: ECEDevelopmentProfile.name, schema: ECEDevelopmentProfileSchema },
      { name: ECEPortfolioEntry.name, schema: ECEPortfolioEntrySchema },
      // Reusing the real Student/StudentAttendance schemas rather than a
      // parallel "Child" entity - the single most important guardrail in
      // the Early Years PRD. Same safe cross-module Mongoose pattern
      // already proven for Campus/Grade/AcademicYear elsewhere.
      { name: StudentAttendance.name, schema: StudentAttendanceSchema },
      { name: Student.name, schema: StudentSchema },
    ]),
  ],
  controllers: [EceController],
  providers: [EceService],
  exports: [EceService],
})
export class EceModule {}
