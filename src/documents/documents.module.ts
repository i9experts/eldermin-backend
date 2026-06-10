import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import {
  DocumentRecord, DocumentRecordSchema,
  WorkflowTemplate, WorkflowTemplateSchema,
  WorkflowInstance, WorkflowInstanceSchema,
} from './schemas/documents.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DocumentRecord.name, schema: DocumentRecordSchema },
      { name: WorkflowTemplate.name, schema: WorkflowTemplateSchema },
      { name: WorkflowInstance.name, schema: WorkflowInstanceSchema },
    ]),
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
