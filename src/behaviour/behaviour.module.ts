import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BehaviourController } from './behaviour.controller';
import { BehaviourService } from './behaviour.service';
import { QaidaController } from './qaida.controller';
import { QaidaService } from './qaida.service';
import { NazraController } from './nazra.controller';
import { NazraService } from './nazra.service';
import { QaidaNazraExtrasController } from './qaida-nazra-extras.controller';
import { QaidaNazraExtrasService } from './qaida-nazra-extras.service';
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
import {
  QaidaNazraSettings, QaidaNazraSettingsSchema,
  InvigilatorAssessment, InvigilatorAssessmentSchema,
  HomeRecitationLog, HomeRecitationLogSchema,
} from './schemas/qaida-nazra-extras.schema';
import { Student, StudentSchema } from '../students/schemas/student.schema';
import { Staff, StaffSchema } from '../modules/hr/schemas/staff.schema';
import { TeacherProfile, TeacherProfileSchema } from '../modules/teaching/schemas/teacher-profile.schema';
import { Role, RoleSchema } from '../roles/schemas/role.schema';
import { User, UserSchema } from '../modules/organization/schemas/user.schema';
import { BehaviourAccessGuard } from './guards/behaviour-access.guard';
import { BehaviourStaffOnlyGuard } from './guards/behaviour-staff-only.guard';

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
      { name: QaidaNazraSettings.name, schema: QaidaNazraSettingsSchema },
      { name: InvigilatorAssessment.name, schema: InvigilatorAssessmentSchema },
      { name: HomeRecitationLog.name, schema: HomeRecitationLogSchema },
      { name: Student.name, schema: StudentSchema },
      // BehaviourAccessGuard (custom-role lookup) + teacher class scoping.
      { name: Staff.name, schema: StaffSchema },
      { name: TeacherProfile.name, schema: TeacherProfileSchema },
      { name: Role.name, schema: RoleSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [BehaviourController, QaidaController, NazraController, QaidaNazraExtrasController],
  providers: [BehaviourService, QaidaService, NazraService, QaidaNazraExtrasService, BehaviourAccessGuard, BehaviourStaffOnlyGuard],
  exports: [BehaviourService, QaidaService, NazraService, QaidaNazraExtrasService],
})
export class BehaviourModule {}
