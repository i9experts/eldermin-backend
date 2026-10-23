import { StudentsService } from './students.service';

// Regression test: an admin's "GR No" entered on the admissions "Process
// Enrollment" modal used to be silently dropped - createFromEnrollment()
// never read grNo/rollNumber off the completed enrollment record at all,
// so the created Student ended up with neither field set.

function makeStudentModel(existing: any = null) {
  const saved: any[] = [];
  class FakeStudentModel {
    data: any;
    constructor(data: any) { this.data = data; }
    async save() { saved.push(this.data); return this.data; }
    static findOne = jest.fn(async () => existing);
  }
  return { Model: FakeStudentModel as any, saved };
}

function makeService(studentModel: any) {
  const n: any = {};
  return new StudentsService(studentModel, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n);
}

describe('StudentsService.createFromEnrollment: GR No / Roll No threading', () => {
  it('passes grNo and rollNumber through onto the created Student document', async () => {
    const { Model, saved } = makeStudentModel(null);
    const svc = makeService(Model);

    await svc.createFromEnrollment({
      applicantId: '6adb0cb2cc237fa999a1de70',
      studentName: 'Ali Khan',
      firstName: 'Ali',
      lastName: 'Khan',
      grade: 'Grade 5',
      section: 'A',
      campusId: 'main',
      admissionNumber: 'ADM-0001',
      admissionDate: new Date('2026-01-01'),
      schoolSlug: 's',
      academicYear: '2025-26',
      enrollmentId: '6adb0cb2cc237fa999a1de71',
      grNo: '0942',
      rollNumber: '12',
    });

    expect(saved).toHaveLength(1);
    expect(saved[0].grNo).toBe('0942');
    expect(saved[0].currentRollNumber).toBe('12');
  });

  it('tolerates grNo/rollNumber being omitted (optional fields)', async () => {
    const { Model, saved } = makeStudentModel(null);
    const svc = makeService(Model);

    await svc.createFromEnrollment({
      applicantId: '6adb0cb2cc237fa999a1de70',
      studentName: 'Ali Khan',
      firstName: 'Ali',
      lastName: 'Khan',
      grade: 'Grade 5',
      campusId: 'main',
      admissionNumber: 'ADM-0002',
      admissionDate: new Date('2026-01-01'),
      schoolSlug: 's',
      academicYear: '2025-26',
      enrollmentId: '6adb0cb2cc237fa999a1de72',
    });

    expect(saved).toHaveLength(1);
    expect(saved[0].grNo).toBeUndefined();
    expect(saved[0].currentRollNumber).toBeUndefined();
  });

  it('returns the existing student unchanged if one already has this admission number (idempotent re-trigger)', async () => {
    const existing = { _id: 'already-there', grNo: 'OLD' };
    const { Model, saved } = makeStudentModel(existing);
    const svc = makeService(Model);

    const result = await svc.createFromEnrollment({
      applicantId: '6adb0cb2cc237fa999a1de70',
      studentName: 'Ali Khan',
      firstName: 'Ali',
      lastName: 'Khan',
      grade: 'Grade 5',
      campusId: 'main',
      admissionNumber: 'ADM-0001',
      admissionDate: new Date('2026-01-01'),
      schoolSlug: 's',
      academicYear: '2025-26',
      enrollmentId: '6adb0cb2cc237fa999a1de71',
      grNo: '9999',
    });

    expect(result).toBe(existing);
    expect(saved).toHaveLength(0);
  });
});
