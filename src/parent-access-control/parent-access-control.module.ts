import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ParentAccessControlController } from './parent-access-control.controller';
import { ParentAccessControlService } from './parent-access-control.service';
import { ParentFeatureAccess, ParentFeatureAccessSchema } from './schemas/parent-feature-access.schema';
import { Student, StudentSchema } from '../students/schemas/student.schema';
import { User, UserSchema } from '../modules/organization/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ParentFeatureAccess.name, schema: ParentFeatureAccessSchema },
      { name: Student.name, schema: StudentSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [ParentAccessControlController],
  providers: [ParentAccessControlService],
  exports: [ParentAccessControlService],
})
export class ParentAccessControlModule {}
