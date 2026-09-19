import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IdCardsController } from './id-cards.controller';
import { IdCardsService } from './id-cards.service';
import { IdCardTemplate, IdCardTemplateSchema } from './schemas/id-card-template.schema';
import { Student, StudentSchema } from '../../students/schemas/student.schema';
import { Staff, StaffSchema } from '../hr/schemas/staff.schema';
import { SchoolSchema, Campus, CampusSchema } from '../../organization/schemas/organization.schema';
import { GroupInstitution, GroupInstitutionSchema } from '../../organization/schemas/group-institution.schema';
import { PdfModule } from '../../pdf/pdf.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: IdCardTemplate.name, schema: IdCardTemplateSchema },
      { name: Student.name, schema: StudentSchema },
      { name: Staff.name, schema: StaffSchema },
      { name: 'School', schema: SchoolSchema },
      { name: Campus.name, schema: CampusSchema },
      { name: GroupInstitution.name, schema: GroupInstitutionSchema },
    ]),
    PdfModule,
  ],
  controllers: [IdCardsController],
  providers: [IdCardsService],
})
export class IdCardsModule {}
