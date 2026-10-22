import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ParentAccessControlController } from './parent-access-control.controller';
import { ParentAccessControlService } from './parent-access-control.service';
import { ParentFeatureAccess, ParentFeatureAccessSchema } from './schemas/parent-feature-access.schema';
import { Student, StudentSchema } from '../students/schemas/student.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ParentFeatureAccess.name, schema: ParentFeatureAccessSchema },
      { name: Student.name, schema: StudentSchema },
    ]),
  ],
  controllers: [ParentAccessControlController],
  providers: [ParentAccessControlService],
  exports: [ParentAccessControlService],
})
export class ParentAccessControlModule {}
