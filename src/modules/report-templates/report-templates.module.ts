import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReportTemplate, ReportTemplateSchema } from './schemas/report-template.schema';
import { ReportTemplatesService } from './report-templates.service';
import { ReportTemplatesController } from './report-templates.controller';
import { PdfModule } from '../../pdf/pdf.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ReportTemplate.name, schema: ReportTemplateSchema },
    ]),
    PdfModule,
  ],
  controllers: [ReportTemplatesController],
  providers: [ReportTemplatesService],
  exports: [ReportTemplatesService],
})
export class ReportTemplatesModule {}
