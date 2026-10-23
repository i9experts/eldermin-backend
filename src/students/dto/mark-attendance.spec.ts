import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MarkAttendanceDto, BulkAttendanceDto } from './student.dto';

function validRecord(overrides: Record<string, any> = {}) {
  return {
    studentId: '507f1f77bcf86cd799439011',
    studentName: 'Muhammad Ali',
    grade: 'Grade 1',
    date: '2026-10-23',
    status: 'present',
    schoolSlug: 'demo-school',
    ...overrides,
  };
}

describe('MarkAttendanceDto', () => {
  it('accepts a well-formed record with studentName and grade', async () => {
    const dto = plainToInstance(MarkAttendanceDto, validRecord());
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  // Regression: the admin Attendance Register's bulk-save payload omitted
  // studentName/grade, which are required here - with the global
  // ValidationPipe's whitelist:true, that made every save 400 regardless
  // of status. These two assertions pin the required-field contract down
  // so a future payload shape drift fails a test instead of a save button.
  it('rejects a record missing studentName', async () => {
    const { studentName, ...rest } = validRecord();
    const dto = plainToInstance(MarkAttendanceDto, rest);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'studentName')).toBe(true);
  });

  it('rejects a record missing grade', async () => {
    const { grade, ...rest } = validRecord();
    const dto = plainToInstance(MarkAttendanceDto, rest);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'grade')).toBe(true);
  });

  it.each(['present', 'absent', 'late', 'excused', 'half_day', 'half_day_am', 'half_day_pm', 'on_leave', 'medical'])(
    'accepts status %s',
    async (status) => {
      const dto = plainToInstance(MarkAttendanceDto, validRecord({ status }));
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    },
  );

  it('rejects an unknown status', async () => {
    const dto = plainToInstance(MarkAttendanceDto, validRecord({ status: 'on_vacation' }));
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });
});

describe('BulkAttendanceDto', () => {
  it('accepts a batch of well-formed records', async () => {
    const dto = plainToInstance(BulkAttendanceDto, {
      schoolSlug: 'demo-school',
      academicYear: '2026-27',
      records: [validRecord(), validRecord({ status: 'half_day_am' }), validRecord({ status: 'on_leave' })],
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('surfaces a nested validation error when one record is missing required fields', async () => {
    const { studentName, ...incomplete } = validRecord();
    const dto = plainToInstance(BulkAttendanceDto, {
      schoolSlug: 'demo-school',
      academicYear: '2026-27',
      records: [validRecord(), incomplete],
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'records')).toBe(true);
  });
});
