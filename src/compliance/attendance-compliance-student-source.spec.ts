import { AttendanceComplianceService } from './attendance-compliance.service';

// Pins the fix for a real-world incident: teachers reported marking three
// months of attendance through the real Eldermin attendance screen, but
// the Governance > Attendance Compliance dashboard showed none of it.
// Root cause - this service used to read student attendance from
// `modules/students/schemas/student-attendance.schema` (collection
// `studentAttendance`, keyed on tenantId), a legacy schema nothing in the
// app ever writes to. The real write path
// (StudentsService.markAttendance/bulkMarkAttendance) writes to the
// schoolSlug-keyed `student_attendance` collection
// (students/schemas/student-supporting.schema). The two were never the
// same data. Also: the student side used to go completely blank whenever
// Tenant resolution failed, even though it no longer needs tenantId at
// all - only the (unrelated) staff side genuinely does.

function makeService({ tenantFound = true }: { tenantFound?: boolean } = {}) {
  const studentAttendanceAgg = [
    { _id: 's1', statuses: ['present', 'present', 'absent'] },
  ];
  const studentAttendanceModel: any = {
    aggregate: jest.fn(async (pipeline: any[]) => {
      // Pins the actual match shape: schoolSlug, never tenantId.
      expect(pipeline[0].$match).toHaveProperty('schoolSlug', 'demo-school');
      expect(pipeline[0].$match).not.toHaveProperty('tenantId');
      return studentAttendanceAgg;
    }),
  };
  const studentModel: any = {
    find: jest.fn(() => ({
      select: () => ({
        lean: () => Promise.resolve([{ _id: 's1', firstName: 'Ayesha', lastName: 'Khan', campusId: 'c1' }]),
      }),
    })),
  };
  const staffAttendanceModel: any = { aggregate: jest.fn(async () => []) };
  const staffModel: any = { find: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve([]) }) })) };
  const campusModel: any = { find: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve([{ _id: 'c1', name: 'Main Campus' }]) }) })) };
  const tenantModel: any = { findOne: jest.fn(() => ({ lean: () => Promise.resolve(tenantFound ? { _id: 't1' } : null) })) };
  const settingsModel: any = { findOne: jest.fn(() => ({ lean: () => Promise.resolve(null) })) };

  const service = new AttendanceComplianceService(
    tenantModel, studentModel, studentAttendanceModel, staffModel, staffAttendanceModel, campusModel, settingsModel,
  );
  return { service, studentAttendanceModel };
}

describe('AttendanceComplianceService student data source', () => {
  it('reads the live, schoolSlug-keyed student_attendance collection, not the dead tenantId-keyed one', async () => {
    const { service } = makeService();
    const result = await service.getAttendanceComplianceData('demo-school');
    expect(result.students.totalWithData).toBe(1);
    expect(result.students.overallRatePercent).not.toBeNull();
  });

  it('still returns real student attendance data even when the school has no resolvable Tenant record', async () => {
    const { service } = makeService({ tenantFound: false });
    const result = await service.getAttendanceComplianceData('demo-school');
    expect(result.hasTenant).toBe(false);
    // Student side must NOT be blanked out just because Tenant resolution
    // (only genuinely needed for the staff side) failed.
    expect(result.students.totalWithData).toBe(1);
    expect(result.staff.totalWithData).toBe(0);
  });
});
