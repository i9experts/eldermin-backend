import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CertificatesController } from './certificates.controller';
import { CertificatesService } from './certificates.service';
import { CertificateTemplate, CertificateTemplateSchema } from './schemas/certificate-template.schema';
import { IssuedCertificate, IssuedCertificateSchema } from './schemas/issued-certificate.schema';
import { Student, StudentSchema } from '../../students/schemas/student.schema';
import { SchoolSchema, Campus, CampusSchema } from '../../organization/schemas/organization.schema';
import { GroupInstitution, GroupInstitutionSchema } from '../../organization/schemas/group-institution.schema';
import { PdfModule } from '../../pdf/pdf.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CertificateTemplate.name, schema: CertificateTemplateSchema },
      { name: IssuedCertificate.name, schema: IssuedCertificateSchema },
      { name: Student.name, schema: StudentSchema },
      { name: 'School', schema: SchoolSchema },
      { name: Campus.name, schema: CampusSchema },
      { name: GroupInstitution.name, schema: GroupInstitutionSchema },
    ]),
    PdfModule,
  ],
  controllers: [CertificatesController],
  providers: [CertificatesService],
  exports: [CertificatesService],
})
export class CertificatesModule {}
