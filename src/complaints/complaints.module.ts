import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ComplaintsController } from './complaints.controller';
import { ComplaintsService } from './complaints.service';
import {
  ComplaintCaseType, ComplaintCaseTypeSchema,
  ComplaintCase, ComplaintCaseSchema,
} from './schemas/complaint.schema';
import { Staff, StaffSchema } from '../modules/hr/schemas/staff.schema';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ComplaintCaseType.name, schema: ComplaintCaseTypeSchema },
      { name: ComplaintCase.name, schema: ComplaintCaseSchema },
      { name: Staff.name, schema: StaffSchema },
    ]),
    EmailModule,
  ],
  controllers: [ComplaintsController],
  providers: [ComplaintsService],
  exports: [ComplaintsService],
})
export class ComplaintsModule {}
