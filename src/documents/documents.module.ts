import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { SignaturesController } from './signatures.controller';
import { SignaturesService } from './signatures.service';
import {
  DocumentRecord, DocumentRecordSchema,
  WorkflowTemplate, WorkflowTemplateSchema,
  WorkflowInstance, WorkflowInstanceSchema,
} from './schemas/documents.schema';
import { SignatureRequest, SignatureRequestSchema } from './schemas/signature-request.schema';
import { User, UserSchema } from '../modules/organization/schemas/user.schema';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DocumentRecord.name, schema: DocumentRecordSchema },
      { name: WorkflowTemplate.name, schema: WorkflowTemplateSchema },
      { name: WorkflowInstance.name, schema: WorkflowInstanceSchema },
      { name: SignatureRequest.name, schema: SignatureRequestSchema },
      { name: User.name, schema: UserSchema },
    ]),
    EmailModule,
  ],
  controllers: [DocumentsController, SignaturesController],
  providers: [DocumentsService, SignaturesService],
  exports: [DocumentsService, SignaturesService],
})
export class DocumentsModule {}
