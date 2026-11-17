import { StudentsService } from './students.service';

// Pins the other half of the "teacher marked months of attendance, admin
// sees none" incident: getAttendance / getStudentAttendanceSummaryReport
// used to filter by exact grade/section string equality, while the grade/
// section on an attendance record is a free-text snapshot taken from the
// marking teacher's own class assignment at save time - a different
// spelling (e.g. "GRADE-3" vs "Grade 3") than the canonical name an admin
// picks from the Grade master silently returned zero rows for real,
// correctly-saved records. Same gradeMatcher/sectionMatcher fix already
// shipped for getStudents (Assessments Enter Marks / Student Directory).

function makeService(attendanceModel: any) {
  const n: any = { findOne: () => ({ lean: () => Promise.resolve(null) }) };
  return new StudentsService(n, attendanceModel, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n);
}

const RECORD = {
  studentId: '507f1f77bcf86cd799439011', studentName: 'Ali', grade: 'GRADE-3', section: 'section a',
  status: 'present', date: new Date('2026-01-05'),
};

describe('getAttendance grade/section matching', () => {
  it('finds a record whose stored grade/section spelling differs from the admin-selected canonical name', async () => {
    let capturedFilter: any;
    const attendanceModel: any = {
      find: jest.fn((filter: any) => {
        capturedFilter = filter;
        return { sort: () => ({ skip: () => ({ limit: () => Promise.resolve([RECORD]) }) }) };
      }),
      countDocuments: jest.fn(async () => 1),
    };
    const svc = makeService(attendanceModel);
    const result = await svc.getAttendance('demo-school', { grade: 'Grade 3', section: 'A', page: 1, limit: 20 } as any);

    expect(result.meta.total).toBe(1);
    // The filter must be regex-based (gradeMatcher/sectionMatcher), not a
    // bare string - a plain string filter is exactly the bug being fixed.
    expect(capturedFilter.grade).toBeInstanceOf(RegExp);
    expect(capturedFilter.section).toBeInstanceOf(RegExp);
    expect(capturedFilter.grade.test('GRADE-3')).toBe(true);
    expect(capturedFilter.section.test('section a')).toBe(true);
  });
});

describe('getStudentAttendanceSummaryReport grade/section matching', () => {
  it('finds a record whose stored grade/section spelling differs from the admin-selected canonical name', async () => {
    let capturedFilter: any;
    const attendanceModel: any = {
      find: jest.fn((filter: any) => {
        capturedFilter = filter;
        return { sort: () => ({ lean: () => Promise.resolve([RECORD]) }) };
      }),
    };
    const svc = makeService(attendanceModel);
    const result = await svc.getStudentAttendanceSummaryReport('demo-school', { grade: 'Grade 3', section: 'A' });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].studentName).toBe('Ali');
    expect(capturedFilter.grade).toBeInstanceOf(RegExp);
    expect(capturedFilter.section).toBeInstanceOf(RegExp);
  });
});
