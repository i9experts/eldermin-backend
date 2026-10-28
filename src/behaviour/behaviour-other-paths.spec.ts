// B0: the other places behaviour data can be reached by a parent/student token:
// legacy /students behaviour store (C), Student 360 (carries behaviour history),
// and the Tarbiyah PDF reports.
import { ForbiddenException } from '@nestjs/common';
import { StudentsController } from '../students/students.controller';
import { PdfController } from '../pdf/pdf.controller';

const SID = '6adb0cb2cc237fa999a1de70';
const OTHER = '6adb0cb2cc237fa999a1de71';
const req = (user: any) => ({ user: { schoolSlug: 'demo', ...user }, headers: {} });

function studentsController() {
  const service: any = {
    getBehaviour: jest.fn(async () => ({ data: [] })),
    createBehaviour: jest.fn(async () => ({})),
    updateBehaviour: jest.fn(async () => ({})),
    getStudent360: jest.fn(async () => ({ student: { _id: SID }, behaviour: { totalPoints: 1, recent: [] } })),
  };
  return { ctl: new StudentsController(service), service };
}

describe('legacy /students behaviour routes (store C)', () => {
  it.each(['parent', 'student'])('%s token: 403 on list, per-student, create and update (service never reached)', async (role) => {
    const { ctl, service } = studentsController();
    const r = req({ role });
    await expect(ctl.getBehaviour(r, {} as any)).rejects.toThrow(ForbiddenException);
    await expect(ctl.getStudentBehaviour(SID, r, {} as any)).rejects.toThrow(ForbiddenException);
    await expect(ctl.createBehaviour({} as any, r)).rejects.toThrow(ForbiddenException);
    await expect(ctl.updateBehaviour('x', {} as any, r)).rejects.toThrow(ForbiddenException);
    expect(service.getBehaviour).not.toHaveBeenCalled();
    expect(service.createBehaviour).not.toHaveBeenCalled();
    expect(service.updateBehaviour).not.toHaveBeenCalled();
  });

  it('staff roles are unchanged', async () => {
    const { ctl, service } = studentsController();
    await expect(ctl.getBehaviour(req({ role: 'teacher' }), {} as any)).resolves.toBeDefined();
    await expect(ctl.getStudentBehaviour(SID, req({ role: 'principal' }), {} as any)).resolves.toBeDefined();
    expect(service.getBehaviour).toHaveBeenCalledTimes(2);
  });
});

describe('GET /students/:id/360 (carries behaviour history)', () => {
  it("a parent can read their own child's 360 but not another student's", async () => {
    const { ctl, service } = studentsController();
    const parent = req({ role: 'parent', userId: 'p1', guardianOfStudentIds: [SID] });
    await expect(ctl.getStudent360(SID, parent)).resolves.toBeDefined();
    await expect(ctl.getStudent360(OTHER, parent)).rejects.toThrow(ForbiddenException);
    expect(service.getStudent360).toHaveBeenCalledTimes(1);
  });

  it('a student token only reaches its own record; staff are unaffected', async () => {
    const { ctl } = studentsController();
    await expect(ctl.getStudent360(SID, req({ role: 'student', linkedStudentId: SID }))).resolves.toBeDefined();
    await expect(ctl.getStudent360(OTHER, req({ role: 'student', linkedStudentId: SID }))).rejects.toThrow(ForbiddenException);
    await expect(ctl.getStudent360(OTHER, req({ role: 'teacher' }))).resolves.toBeDefined();
  });
});

describe('Tarbiyah PDF reports', () => {
  const res: any = { set: jest.fn(), status: () => ({ end: jest.fn() }) };
  const pdfService: any = {
    generateTarbiyahReport: jest.fn(async () => Buffer.from('x')),
    generateTarbiyahClassReport: jest.fn(async () => Buffer.from('x')),
    generateTarbiyahSchoolReport: jest.fn(async () => Buffer.from('x')),
  };
  const ctl: any = new (PdfController as any)(pdfService);

  it.each(['parent', 'student'])('%s token: all three tarbiyah PDF routes are 403 and generate nothing', async (role) => {
    const r = req({ role, userId: 'u1' });
    await expect(ctl.generateTarbiyahReport({ assessmentId: SID }, r, res)).rejects.toThrow(ForbiddenException);
    await expect(ctl.generateTarbiyahClassReport({ grade: '5' }, r, res)).rejects.toThrow(ForbiddenException);
    await expect(ctl.generateTarbiyahSchoolReport({}, r, res)).rejects.toThrow(ForbiddenException);
    expect(pdfService.generateTarbiyahReport).not.toHaveBeenCalled();
    expect(pdfService.generateTarbiyahClassReport).not.toHaveBeenCalled();
    expect(pdfService.generateTarbiyahSchoolReport).not.toHaveBeenCalled();
  });

  it('staff still generate them', async () => {
    await ctl.generateTarbiyahReport({ assessmentId: SID }, req({ role: 'teacher', userId: 'u1' }), res);
    expect(pdfService.generateTarbiyahReport).toHaveBeenCalledTimes(1);
  });
});

// Found by the live smoke test: with only an in-handler check, DTO validation (400) ran BEFORE the 403 for a
// parent/student token with an invalid body. The denial must be a guard so it precedes the pipes.
describe('parent/student denial runs as a guard (before body validation)', () => {
  const guardsOf = (fn: any) => Reflect.getMetadata('__guards__', fn) || [];
  const { BehaviourStaffOnlyGuard } = require('./guards/behaviour-staff-only.guard');
  it.each(['getBehaviour', 'getStudentBehaviour', 'createBehaviour', 'updateBehaviour'])('StudentsController.%s', (h) => {
    expect(guardsOf((StudentsController.prototype as any)[h])).toContain(BehaviourStaffOnlyGuard);
  });
  it.each(['generateQaidaReport', 'generateTarbiyahReport', 'generateTarbiyahClassReport', 'generateTarbiyahSchoolReport'])('PdfController.%s', (h) => {
    expect(guardsOf((PdfController.prototype as any)[h])).toContain(BehaviourStaffOnlyGuard);
  });
});
