import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { Student, StudentSchema } from './schemas/student.schema';
import { Guardian, GuardianSchema } from './schemas/guardian.schema';
import { StudentAttendance, StudentAttendanceSchema } from './schemas/student-attendance.schema';
import { MedicalRecord, MedicalRecordSchema } from './schemas/medical-record.schema';
import { StudentNote, StudentNoteSchema } from './schemas/student-note.schema';
import { StudentDocument, StudentDocumentSchema } from './schemas/student-document.schema';
import { AcademicHistory, AcademicHistorySchema } from './schemas/academic-history.schema';
import { EnrollmentField, EnrollmentFieldSchema } from './schemas/enrollment-field.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Student.name, schema: StudentSchema },
      { name: Guardian.name, schema: GuardianSchema },
      { name: StudentAttendance.name, schema: StudentAttendanceSchema },
      { name: MedicalRecord.name, schema: MedicalRecordSchema },
      { name: StudentNote.name, schema: StudentNoteSchema },
      { name: StudentDocument.name, schema: StudentDocumentSchema },
      { name: AcademicHistory.name, schema: AcademicHistorySchema },
      { name: EnrollmentField.name, schema: EnrollmentFieldSchema },
    ]),
  ],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}
