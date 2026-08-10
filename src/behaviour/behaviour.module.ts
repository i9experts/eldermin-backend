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
import {
  CharacterProgramSettings, CharacterProgramSettingsSchema,
} from './schemas/character-program-settings.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BehaviourRecord.name, schema: BehaviourRecordSchema },
      { name: TarbiyahAssessment.name, schema: TarbiyahAssessmentSchema },
      { name: CounsellingSession.name, schema: CounsellingSessionSchema },
      { name: Intervention.name, schema: InterventionSchema },
      { name: BehaviourContract.name, schema: BehaviourContractSchema },
      { name: CharacterProgramSettings.name, schema: CharacterProgramSettingsSchema },
    ]),
  ],
  controllers: [BehaviourController],
  providers: [BehaviourService],
  exports: [BehaviourService],
})
export class BehaviourModule {}
