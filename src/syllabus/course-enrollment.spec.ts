import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SyllabusService } from './syllabus.service';

// LMS Phase 1: a syllabus with enrollmentMode 'manual' is an elective -
// only students with an active CourseEnrollment row can see it, instead
// of the usual grade/section match. These tests cover the service-level
// guard rails around building that roster.
const TENANT_ID = '507f1f77bcf86cd799439011';
const SYLLABUS_ID = '507f1f77bcf86cd799439012';
const STUDENT_ID = '507f1f77bcf86cd799439013';

function build(existingSyllabus: any = { _id: SYLLABUS_ID, teacherId: 'S1', enrollmentMode: 'manual' }) {
  const bulkWriteOps: any[] = [];
  const enrollmentDocs: any[] = [];

  function SyllabusModel() {}
  (SyllabusModel as any).findOne = jest.fn(() => ({
    select: () => ({ lean: async () => existingSyllabus }),
  }));
  (SyllabusModel as any).findOneAndUpdate = jest.fn(async (_f: any, u: any) => ({ ...existingSyllabus, ...u.$set }));

  function EnrollmentModel() {}
  (EnrollmentModel as any).bulkWrite = jest.fn(async (ops: any[]) => { bulkWriteOps.push(...ops); });
  (EnrollmentModel as any).find = jest.fn(() => ({
    sort: () => ({ lean: async () => enrollmentDocs }),
  }));
  (EnrollmentModel as any).findOneAndUpdate = jest.fn(async (filter: any) => {
    const match = enrollmentDocs.find((e) => e.studentId === filter.studentId);
    if (!match) return null;
    match.status = 'dropped';
    return match;
  });

  function StudentModel() {}
  (StudentModel as any).find = jest.fn(() => ({
    select: () => ({ lean: async () => [{ _id: STUDENT_ID, firstName: 'Ali', lastName: 'Khan' }] }),
  }));

  const svc: any = Object.create(SyllabusService.prototype);
  svc.syllabusModel = SyllabusModel;
  svc.enrollmentModel = EnrollmentModel;
  svc.studentModel = StudentModel;
  svc.teacherIdentity = async () => ({ staffId: 'S1', teacherProfileId: 'P1', userId: 'U1', name: 'T' });
  return { svc: svc as SyllabusService, bulkWriteOps, enrollmentDocs };
}

describe('SyllabusService course enrollment (LMS Phase 1)', () => {
  it('enrollStudents refuses when the syllabus is not in manual enrollment mode', async () => {
    const { svc } = build({ _id: SYLLABUS_ID, teacherId: 'S1', enrollmentMode: 'auto_by_class' });
    await expect(svc.enrollStudents(TENANT_ID, 'demo-school', SYLLABUS_ID, [STUDENT_ID], 'Admin', undefined))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('enrollStudents refuses when a student id does not resolve at this school', async () => {
    const { svc } = build();
    await expect(svc.enrollStudents(TENANT_ID, 'demo-school', SYLLABUS_ID, [STUDENT_ID, '507f1f77bcf86cd799439099'], 'Admin', undefined))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('enrollStudents upserts one bulkWrite op per resolved student and returns the roster', async () => {
    const { svc, bulkWriteOps } = build();
    const result = await svc.enrollStudents(TENANT_ID, 'demo-school', SYLLABUS_ID, [STUDENT_ID], 'Admin', undefined);
    expect(bulkWriteOps).toHaveLength(1);
    expect(String(bulkWriteOps[0].updateOne.filter.studentId)).toBe(STUDENT_ID);
    expect(bulkWriteOps[0].updateOne.update.$set.status).toBe('active');
    expect(bulkWriteOps[0].updateOne.upsert).toBe(true);
    expect(result).toEqual([]); // listEnrollments mock returns the empty enrollmentDocs seed
  });

  it('setEnrollmentMode writes the new mode', async () => {
    const { svc } = build();
    const result = await svc.setEnrollmentMode(TENANT_ID, SYLLABUS_ID, 'manual', undefined);
    expect(result.enrollmentMode).toBe('manual');
  });

  it('unenrollStudent 404s when there is no matching enrollment to drop', async () => {
    const { svc } = build();
    await expect(svc.unenrollStudent(TENANT_ID, SYLLABUS_ID, 'stuNotEnrolled', undefined)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('unenrollStudent marks an existing enrollment dropped', async () => {
    const { svc, enrollmentDocs } = build();
    enrollmentDocs.push({ studentId: STUDENT_ID, status: 'active' });
    await svc.unenrollStudent(TENANT_ID, SYLLABUS_ID, STUDENT_ID, undefined);
    expect(enrollmentDocs[0].status).toBe('dropped');
  });
});
