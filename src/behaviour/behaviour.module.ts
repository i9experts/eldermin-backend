import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BehaviourController } from './behaviour.controller';
import { BehaviourService } from './behaviour.service';
import {
  BehaviourRecord, BehaviourRecordSchema,
  TarbiyahAssessment, TarbiyahAssessmentSchema,
  CounsellingSession, CounsellingSessionSchema,
  Intervention, InterventionSchema,
  BehaviourContract, BehaviourContractSchema,
} from './schemas/behaviour.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BehaviourRecord.name, schema: BehaviourRecordSchema },
      { name: TarbiyahAssessment.name, schema: TarbiyahAssessmentSchema },
      { name: CounsellingSession.name, schema: CounsellingSessionSchema },
      { name: Intervention.name, schema: InterventionSchema },
      { name: BehaviourContract.name, schema: BehaviourContractSchema },
    ]),
  ],
  controllers: [BehaviourController],
  providers: [BehaviourService],
  exports: [BehaviourService],
})
export class BehaviourModule {}
