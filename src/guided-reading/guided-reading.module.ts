import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReadingLevel, ReadingLevelSchema } from './schemas/reading-level.schema';
import { Reader, ReaderSchema } from './schemas/reader.schema';
import {
  StudentReadingProgress, StudentReadingProgressSchema,
} from './schemas/student-reading-progress.schema';
import { GuidedReadingService } from './guided-reading.service';
import { GuidedReadingController } from './guided-reading.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ReadingLevel.name, schema: ReadingLevelSchema },
      { name: Reader.name, schema: ReaderSchema },
      { name: StudentReadingProgress.name, schema: StudentReadingProgressSchema },
    ]),
  ],
  controllers: [GuidedReadingController],
  providers: [GuidedReadingService],
  exports: [GuidedReadingService],
})
export class GuidedReadingModule {}
