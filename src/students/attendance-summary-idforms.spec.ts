import { Types } from 'mongoose';
import { StudentsService } from './students.service';

const SID = new Types.ObjectId().toHexString();

describe('StudentsService attendance summary', () => {
  function svc(model: any) { const s: any = Object.create(StudentsService.prototype); s.attendanceModel = model; return s as StudentsService; }
  it('the per-student summary matches both id forms (aggregate bypasses the id-match plugin)', async () => {
    const aggregate = jest.fn(async () => []);
    await svc({ aggregate }).getStudentAttendanceSummary(SID, 'sch');
    const match = (aggregate.mock.calls[0] as any[])[0][0].$match;
    expect(match.studentId.$in).toHaveLength(2);
    expect(match.schoolSlug).toBe('sch');
  });
});
