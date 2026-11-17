import { NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../auth/decorators';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/roles.enum';
import { NON_STAFF_ROLES } from '../auth/admin-role-sets';
import { AssessmentController, EXAM_PAPER_READ_ROLES } from './assessment.controller';
import { makeAssessmentService, oid } from './assessment-test-fakes';

// A single exam paper (and its PDF) carries the answer key: staff only.
const HANDLERS = ['getExamPaperById', 'downloadExamPaperPdf'] as const;
const proto: any = AssessmentController.prototype;

function ctx(handler: string, role: string) {
  return {
    getHandler: () => proto[handler],
    getClass: () => AssessmentController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role, schoolSlug: 'school-a' } }) }),
  } as any;
}
const guard = new RolesGuard(new Reflector());
const allowed = (handler: string, role: string) => {
  try { return guard.canActivate(ctx(handler, role)) === true; } catch { return false; }
};

describe('exam paper read routes are staff-only', () => {
  it('both routes carry the staff role set (everything except parent, student, resellers)', () => {
    for (const h of HANDLERS) {
      const roles = Reflect.getMetadata(ROLES_KEY, proto[h]) as UserRole[];
      expect([...roles].sort()).toEqual([...EXAM_PAPER_READ_ROLES].sort());
    }
    for (const r of NON_STAFF_ROLES) expect(EXAM_PAPER_READ_ROLES).not.toContain(r);
    expect(EXAM_PAPER_READ_ROLES).toEqual(expect.arrayContaining([
      UserRole.TEACHER, UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.INSTITUTION_OWNER, UserRole.SUPER_ADMIN,
    ]));
  });

  describe.each(HANDLERS)('%s', (h) => {
    it.each([UserRole.PARENT, UserRole.STUDENT, UserRole.RESELLER_ADMIN, UserRole.RESELLER_SUPPORT])('denies %s', (role) => {
      expect(allowed(h, role)).toBe(false);
    });
    it.each([
      UserRole.TEACHER, UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.VICE_PRINCIPAL, UserRole.ACADEMIC_COORDINATOR,
      UserRole.INSTITUTION_OWNER, UserRole.SUPER_ADMIN, UserRole.LIBRARIAN, UserRole.SUPPORT_STAFF,
    ])('allows %s', (role) => {
      expect(allowed(h, role)).toBe(true);
    });
    it('denies an unknown role', () => {
      expect(allowed(h, 'made_up_role')).toBe(false);
    });
  });

  it('the paper editor routes keep their existing, narrower guard', () => {
    const create = Reflect.getMetadata(ROLES_KEY, proto.createExamPaper) as UserRole[];
    expect(create).not.toContain(UserRole.PARENT);
    expect(create).not.toContain(UserRole.STUDENT);
  });
});

describe('exam paper lookup stays inside the caller\'s school', () => {
  it('asks for the paper by id AND school; another school\'s paper is a 404', async () => {
    const { service, examPaperModel } = makeAssessmentService({ paper: null });
    const id = oid().toString();
    await expect(service.getExamPaperById(id, 'school-b')).rejects.toBeInstanceOf(NotFoundException);
    expect(examPaperModel.findOne).toHaveBeenCalledWith({ _id: id, schoolSlug: 'school-b' });
  });

  it('only resolves question answers from the caller\'s own school', async () => {
    const q = oid();
    const paper = { _id: oid(), schoolSlug: 'school-a', sections: [{ title: 'S', questionIds: [q] }] };
    const { service, questionModel } = makeAssessmentService({ paper, questions: [{ _id: q, correctAnswer: 'B' }] });
    await service.getExamPaperById(paper._id.toString(), 'school-a');
    expect(questionModel.find).toHaveBeenCalledWith({ _id: { $in: [q] }, schoolSlug: 'school-a' });
  });
});
