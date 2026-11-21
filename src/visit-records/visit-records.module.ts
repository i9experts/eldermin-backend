import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VisitRecord, VisitRecordSchema } from './schemas/visit-record.schema';
import { VisitRecordsService } from './visit-records.service';
import { VisitRecordsController } from './visit-records.controller';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: VisitRecord.name, schema: VisitRecordSchema }]),
    UploadModule,
  ],
  controllers: [VisitRecordsController],
  providers: [VisitRecordsService],
  exports: [VisitRecordsService],
})
export class VisitRecordsModule {}
