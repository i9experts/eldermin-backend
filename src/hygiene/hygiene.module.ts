import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HygieneController } from './hygiene.controller';
import { HygieneService } from './hygiene.service';
import { HygieneCheck, HygieneCheckSchema } from './schemas/hygiene-check.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: HygieneCheck.name, schema: HygieneCheckSchema },
    ]),
  ],
  controllers: [HygieneController],
  providers: [HygieneService],
  exports: [HygieneService],
})
export class HygieneModule {}
