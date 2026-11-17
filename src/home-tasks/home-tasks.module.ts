import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HomeTasksController } from './home-tasks.controller';
import { HomeTasksService } from './home-tasks.service';
import { HomeTask, HomeTaskSchema } from './schemas/home-task.schema';
import { Student, StudentSchema } from '../students/schemas/student.schema';
import { Staff, StaffSchema } from '../modules/hr/schemas/staff.schema';
import { TeacherProfile, TeacherProfileSchema } from '../modules/teaching/schemas/teacher-profile.schema';
import { Role, RoleSchema } from '../roles/schemas/role.schema';
import { User, UserSchema } from '../modules/organization/schemas/user.schema';
import { BehaviourAccessGuard } from '../behaviour/guards/behaviour-access.guard';
import { ParentAccessControlModule } from '../parent-access-control/parent-access-control.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: HomeTask.name, schema: HomeTaskSchema },
      { name: Student.name, schema: StudentSchema },
      // BehaviourAccessGuard (custom-role lookup) + teacher class scoping
      { name: Staff.name, schema: StaffSchema },
      { name: TeacherProfile.name, schema: TeacherProfileSchema },
      { name: Role.name, schema: RoleSchema },
      { name: User.name, schema: UserSchema },
    ]),
    ParentAccessControlModule,
  ],
  controllers: [HomeTasksController],
  providers: [HomeTasksService, BehaviourAccessGuard],
  exports: [HomeTasksService],
})
export class HomeTasksModule {}
