import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BehaviourController } from './behaviour.controller';
import { BehaviourService } from './behaviour.service';
import { QaidaController } from './qaida.controller';
import { QaidaService } from './qaida.service';
import { NazraController } from './nazra.controller';
import { NazraService } from './nazra.service';
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
import { QaidaProgress, QaidaProgressSchema } from './schemas/qaida-progress.schema';
import { NazraProgress, NazraProgressSchema } from './schemas/nazra-progress.schema';
import { Student, StudentSchema } from '../students/schemas/student.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BehaviourRecord.name, schema: BehaviourRecordSchema },
      { name: TarbiyahAssessment.name, schema: TarbiyahAssessmentSchema },
      { name: CounsellingSession.name, schema: CounsellingSessionSchema },
      { name: Intervention.name, schema: InterventionSchema },
      { name: BehaviourContract.name, schema: BehaviourContractSchema },
      { name: CharacterProgramSettings.name, schema: CharacterProgramSettingsSchema },
      { name: QaidaProgress.name, schema: QaidaProgressSchema },
      { name: NazraProgress.name, schema: NazraProgressSchema },
      { name: Student.name, schema: StudentSchema },
    ]),
  ],
  controllers: [BehaviourController, QaidaController, NazraController],
  providers: [BehaviourService, QaidaService, NazraService],
  exports: [BehaviourService, QaidaService, NazraService],
})
export class BehaviourModule {}
