import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Syllabus, SyllabusSchema } from './schemas/syllabus.schema';
import { SyllabusService } from './syllabus.service';
import { SyllabusController } from './syllabus.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Syllabus.name, schema: SyllabusSchema }]),
  ],
  controllers: [SyllabusController],
  providers: [SyllabusService],
  exports: [SyllabusService],
})
export class SyllabusModule {}
