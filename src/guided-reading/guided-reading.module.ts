import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReadingLevel, ReadingLevelSchema } from './schemas/reading-level.schema';
import { Reader, ReaderSchema } from './schemas/reader.schema';
import {
  StudentReadingProgress, StudentReadingProgressSchema,
} from './schemas/student-reading-progress.schema';
import { StudentSchema } from '../students/schemas/student.schema';
import { GuidedReadingService } from './guided-reading.service';
import { GuidedReadingController } from './guided-reading.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ReadingLevel.name, schema: ReadingLevelSchema },
      { name: Reader.name, schema: ReaderSchema },
      { name: StudentReadingProgress.name, schema: StudentReadingProgressSchema },
      // Needed only to resolve "every student in grade X section Y" for
      // bulk class-level assignment - same string-literal registration
      // convention PdfModule/ParentPortalModule already use for 'Student'.
      { name: 'Student', schema: StudentSchema },
    ]),
  ],
  controllers: [GuidedReadingController],
  providers: [GuidedReadingService],
  exports: [GuidedReadingService],
})
export class GuidedReadingModule {}
