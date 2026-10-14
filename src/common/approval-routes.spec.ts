import 'reflect-metadata';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Types } from 'mongoose';
import { ComplianceController } from '../compliance/compliance.controller';
import { ComplianceService } from '../compliance/compliance.service';
import { DocumentsController } from '../documents/documents.controller';
import { DocumentsService } from '../documents/documents.service';
import { SubstitutionController } from '../modules/teaching/substitution.controller';
import { SubstitutionService } from '../modules/teaching/substitution.service';
import { AssessmentController } from '../assessments/assessment.controller';
import { AssessmentService } from '../assessments/assessment.service';
import { RolesGuard } from '../auth/roles.guard';
import { RolesOrModuleManageGuard } from '../roles/guards/roles-or-module-manage.guard';
import { ROLES_KEY } from '../auth/decorators';
import { ROLES_OR_MODULE_KEY } from '../roles/decorators/roles-or-module-manage.decorator';
import { APPROVAL_DECIDER_ROLES, NON_STAFF_ROLES, SCHOOL_STAFF_ROLES, STAFF_WRITE_ROLES, TEACHING_ADMIN_ROLES } from '../auth/role-sets';
import { UserRole } from '../auth/roles.enum';
import { assertNotSelfApproval, sameName } from './utils/approval-guards.util';

const OID = () => new Types.ObjectId().toHexString();
const ME = OID(), OTHER = OID();

// ---------------------------------------------------------------- helpers
const ctxFor = (cls: any, handler: string, user: any): any => ({ getHandler: () => cls.prototype[handler], getClass: () => cls, switchToHttp: () => ({ getRequest: () => ({ user }) }) });
const rolesGuard = new RolesGuard(new Reflector());
const baseAllows = (cls: any, h: string, role: string) => { try { return rolesGuard.canActivate(ctxFor(cls, h, { role })); } catch (e) { if (e instanceof ForbiddenException) return false; throw e; } };
function customGuard(moduleAccess: any[] | null) {
  const userModel: any = { findById: () => ({ select: () => ({ lean: async () => ({ customRoleId: moduleAccess ? 'cr' : null }) }) }) };
  const roleModel: any = { findById: () => ({ select: () => ({ lean: async () => (moduleAccess ? { moduleAccess } : null) }) }) };
  return new RolesOrModuleManageGuard(new Reflector(), roleModel, userModel);
}
const modAllows = async (g: RolesOrModuleManageGuard, cls: any, h: string, user: any) => { try { return await g.canActivate(ctxFor(cls, h, user)); } catch (e) { if (e instanceof ForbiddenException) return false; throw e; } };

// ---------------------------------------------------------------- shared rule
describe('approval-guards.util', () => {
  it('sameName is trimmed and case-insensitive; empty never matches', () => {
    expect(sameName(' Ayesha Khan ', 'ayesha khan')).toBe(true);
    expect(sameName('', '')).toBe(false); expect(sameName(undefined, 'x')).toBe(false);
  });
  it('self-approval: by id or by name is 403; the owner and super_admin are exempt; someone else passes', () => {
    expect(() => assertNotSelfApproval({ userId: ME, name: 'X', role: 'principal' }, { id: ME }, 'request')).toThrow(ForbiddenException);
    expect(() => assertNotSelfApproval({ userId: OTHER, name: 'Ayesha', role: 'admin' }, { name: 'ayesha' }, 'request')).toThrow(ForbiddenException);
    expect(() => assertNotSelfApproval({ userId: ME, name: 'X', role: 'institution_owner' }, { id: ME, name: 'X' }, 'request')).not.toThrow();
    expect(() => assertNotSelfApproval({ userId: ME, name: 'X', role: 'super_admin' }, { id: ME }, 'request')).not.toThrow();
    expect(() => assertNotSelfApproval({ userId: OTHER, name: 'Other', role: 'principal' }, { id: ME, name: 'Me' }, 'request')).not.toThrow();
  });
});

// ---------------------------------------------------------------- compliance approvals
describe('compliance approvals (institution approval requests)', () => {
  const DECIDE = ['decideApproval', 'updateApproval'];
  it('decide and edit carry the decider roles + the institution/approvals sub-module; list and create are staff-only', () => {
    for (const h of DECIDE) expect(Reflect.getMetadata(ROLES_OR_MODULE_KEY, ComplianceController.prototype[h as 'decideApproval'])).toMatchObject({ moduleKey: 'institution', subModuleKey: 'approvals', allowModuleWide: true, roles: APPROVAL_DECIDER_ROLES });
    for (const h of ['getApprovals', 'createApproval']) expect(Reflect.getMetadata(ROLES_KEY, (ComplianceController.prototype as any)[h])).toEqual(SCHOOL_STAFF_ROLES);
  });
  it('APPROVAL_DECIDER_ROLES = admin set + HR + finance managers; no teacher, librarian, support, parent, student, reseller', () => {
    expect([...APPROVAL_DECIDER_ROLES].sort()).toEqual([...TEACHING_ADMIN_ROLES, UserRole.HR_MANAGER, UserRole.FINANCE_MANAGER].sort());
    for (const r of ['teacher', 'librarian', 'support_staff', 'parent', 'student', 'reseller_admin']) expect(APPROVAL_DECIDER_ROLES as string[]).not.toContain(r);
  });
  it('the real guard: teachers refused, deciders pass; a custom role needs institution:approvals or module-wide institution (admin) - not a sibling sub-module', async () => {
    const none = customGuard(null);
    for (const h of DECIDE) {
      for (const role of ['teacher', 'librarian', 'support_staff', 'parent', 'student']) expect(await modAllows(none, ComplianceController, h, { userId: 'u', role })).toBe(false);
      for (const role of ['principal', 'admin', 'institution_owner', 'hr_manager', 'finance_manager', 'academic_coordinator']) expect(await modAllows(none, ComplianceController, h, { userId: 'u', role })).toBe(true);
      expect(await modAllows(customGuard([{ moduleKey: 'institution', subModuleKey: 'approvals', level: 'manage' }]), ComplianceController, h, { userId: 'u', role: 'support_staff' })).toBe(true);
      expect(await modAllows(customGuard([{ moduleKey: 'institution', level: 'manage' }]), ComplianceController, h, { userId: 'u', role: 'support_staff' })).toBe(true);
      expect(await modAllows(customGuard([{ moduleKey: 'institution', subModuleKey: 'policies', level: 'manage' }]), ComplianceController, h, { userId: 'u', role: 'support_staff' })).toBe(false);
      expect(await modAllows(customGuard([{ moduleKey: 'institution', subModuleKey: 'approvals', level: 'view' }]), ComplianceController, h, { userId: 'u', role: 'support_staff' })).toBe(false);
      expect(await modAllows(customGuard([{ moduleKey: 'teaching', level: 'manage' }]), ComplianceController, h, { userId: 'u', role: 'teacher' })).toBe(false);
    }
  });
  it('list and create refuse parent, student and reseller', () => {
    for (const h of ['getApprovals', 'createApproval']) {
      for (const r of NON_STAFF_ROLES) expect(baseAllows(ComplianceController, h, r)).toBe(false);
      expect(baseAllows(ComplianceController, h, 'teacher')).toBe(true);
    }
  });

  function svc(approval: any, onSave = jest.fn()) {
    const doc: any = approval && { ...approval, save: async function () { onSave(this); return this; } };
    const s: any = Object.create(ComplianceService.prototype);
    s.approvalModel = {
      findOne: jest.fn(async () => doc),
      findOneAndUpdate: jest.fn(async (_f: any, u: any) => ({ ...(approval || {}), ...u.$set })),
    };
    return { s: s as ComplianceService, onSave, doc };
  }
  const chain = (...st: string[]) => st.map((status, i) => ({ order: i, approverName: `A${i}`, status }));
  it('a requester cannot decide their own request (by name); someone else can; the owner is exempt', async () => {
    const mk = () => svc({ status: 'pending', requestedBy: 'Sara Ahmed', approvalChain: chain('pending') });
    await expect(mk().s.decideApprovalStage(OID(), 'sch', 'approved', '', 'sara ahmed', { role: 'principal', name: 'Sara Ahmed', userId: ME })).rejects.toBeInstanceOf(ForbiddenException);
    const ok = mk();
    await ok.s.decideApprovalStage(OID(), 'sch', 'approved', 'fine', 'Bilal', { role: 'principal', name: 'Bilal', userId: OTHER });
    expect(ok.onSave.mock.calls[0][0].status).toBe('approved');
    const owner = mk();
    await owner.s.decideApprovalStage(OID(), 'sch', 'approved', '', 'Sara Ahmed', { role: 'institution_owner', name: 'Sara Ahmed', userId: ME });
    expect(owner.onSave).toHaveBeenCalled();
  });
  it('a finished request is a 409 (was an uncaught Error = 500); bad decision/id are 400; unknown is 404', async () => {
    const done = svc({ status: 'approved', requestedBy: 'x', approvalChain: [] });
    await expect(done.s.decideApprovalStage(OID(), 'sch', 'approved', '', 'B', { role: 'admin', name: 'B' })).rejects.toBeInstanceOf(ConflictException);
    await expect(svc({ status: 'pending', requestedBy: 'x' }).s.decideApprovalStage(OID(), 'sch', 'maybe' as any, '', 'B')).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc({ status: 'pending', requestedBy: 'x' }).s.decideApprovalStage('bad', 'sch', 'approved', '', 'B')).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc(null).s.decideApprovalStage(OID(), 'sch', 'approved', '', 'B')).rejects.toBeInstanceOf(NotFoundException);
  });
  it('a stage decision still advances exactly one stage (behaviour unchanged)', async () => {
    const two = svc({ status: 'pending', requestedBy: 'x', approvalChain: chain('pending', 'pending') });
    await two.s.decideApprovalStage(OID(), 'sch', 'approved', '', 'B', { role: 'admin', name: 'B', userId: OTHER });
    expect(two.onSave.mock.calls[0][0].status).toBe('pending');
    expect(two.onSave.mock.calls[0][0].approvalChain[0].status).toBe('approved');
  });
  it('PUT cannot write the decision: status / decidedBy / chain / school / requester are stripped (a raw status:approved was a one-call approval)', async () => {
    const { s, doc } = svc({ status: 'pending', requestedBy: 'x' });
    await s.updateApproval(OID(), 'sch', { title: 'new', status: 'approved', decidedBy: 'me', decisionNote: 'ok', approvalChain: [], schoolSlug: 'evil', requestedBy: 'other' });
    expect((s as any).approvalModel.findOneAndUpdate.mock.calls[0][1]).toEqual({ $set: { title: 'new' } });
    void doc;
  });
});

// ---------------------------------------------------------------- document workflows
describe('document workflow actions', () => {
  it('action, cancel and my-approvals are staff-only (parents/students/resellers refused)', () => {
    for (const h of ['takeAction', 'cancelWorkflow', 'getMyApprovals']) {
      for (const r of NON_STAFF_ROLES) expect(baseAllows(DocumentsController, h, r)).toBe(false);
      expect(baseAllows(DocumentsController, h, 'teacher')).toBe(true);
    }
  });
  const wf = (over: any = {}) => ({
    status: 'in_progress', currentStep: 1, initiatedBy: 'Initiator', initiatedById: OID(),
    steps: [{ stepOrder: 1, status: 'pending', assignedTo: 'Approver One', assignedToId: ME }, { stepOrder: 2, status: 'pending', assignedTo: 'Approver Two' }],
    ...over,
  });
  function svc(instance: any, saved = jest.fn()) {
    const doc: any = instance && { ...instance, save: async function () { saved(this); return this; } };
    const s: any = Object.create(DocumentsService.prototype);
    s.instanceModel = { findOne: jest.fn(() => { const p: any = Promise.resolve(doc); p.select = () => ({ lean: async () => instance }); return p; }), findOneAndUpdate: jest.fn(async (_f: any, u: any) => ({ ...instance, ...u.$set })) };
    return { s: s as DocumentsService, saved, doc };
  }
  const me = { userId: ME, name: 'Approver One', role: 'teacher' };
  it('the assignee approves the CURRENT step; the actor is the signed-in user, never a name from the body; the next step becomes current', async () => {
    const { s, saved } = svc(wf());
    await s.takeAction(OID(), 'sch', 1, 'approve', me, 'ok');
    const d = saved.mock.calls[0][0];
    expect(d.steps[0]).toMatchObject({ status: 'approved', actionBy: 'Approver One', comments: 'ok' });
    expect(d.currentStep).toBe(2); expect(d.status).toBe('in_progress');
  });
  it('the last approval completes the workflow; a rejection ends it', async () => {
    const last = svc(wf({ currentStep: 2, steps: [{ stepOrder: 1, status: 'approved' }, { stepOrder: 2, status: 'pending', assignedTo: 'Approver One', assignedToId: ME }] }));
    await last.s.takeAction(OID(), 'sch', 2, 'approve', me);
    expect(last.saved.mock.calls[0][0].status).toBe('approved');
    const rej = svc(wf());
    await rej.s.takeAction(OID(), 'sch', 1, 'reject', me, 'no');
    expect(rej.saved.mock.calls[0][0].status).toBe('rejected');
  });
  it('someone else (not assigned) is 403 and nothing is saved; assignment by NAME alone also works (how my-approvals matches)', async () => {
    const a = svc(wf());
    await expect(a.s.takeAction(OID(), 'sch', 1, 'approve', { userId: OID(), name: 'Mallory', role: 'teacher' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(a.saved).not.toHaveBeenCalled();
    const b = svc(wf({ steps: [{ stepOrder: 1, status: 'pending', assignedTo: 'approver one' }] }));
    await b.s.takeAction(OID(), 'sch', 1, 'approve', { userId: OID(), name: 'Approver One', role: 'teacher' });
    expect(b.saved).toHaveBeenCalled();
  });
  it('a step nobody is assigned to can only be acted on by the owner / super_admin', async () => {
    const mk = () => svc(wf({ steps: [{ stepOrder: 1, status: 'pending' }] }));
    await expect(mk().s.takeAction(OID(), 'sch', 1, 'approve', { userId: OID(), name: 'P', role: 'principal' })).rejects.toBeInstanceOf(ForbiddenException);
    const ok = mk(); await ok.s.takeAction(OID(), 'sch', 1, 'approve', { userId: OID(), name: 'Owner', role: 'institution_owner' });
    expect(ok.saved).toHaveBeenCalled();
  });
  it('out of order, already-decided or finished workflows are 409; unknown step 404; bad action/id 400', async () => {
    await expect(svc(wf()).s.takeAction(OID(), 'sch', 2, 'approve', { ...me, name: 'Approver Two' })).rejects.toBeInstanceOf(ConflictException); // step 2 is not current
    await expect(svc(wf({ steps: [{ stepOrder: 1, status: 'approved', assignedToId: ME }] })).s.takeAction(OID(), 'sch', 1, 'approve', me)).rejects.toBeInstanceOf(ConflictException);
    await expect(svc(wf({ status: 'cancelled' })).s.takeAction(OID(), 'sch', 1, 'approve', me)).rejects.toBeInstanceOf(ConflictException);
    await expect(svc(wf()).s.takeAction(OID(), 'sch', 9, 'approve', me)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc(wf()).s.takeAction(OID(), 'sch', 1, 'maybe' as any, me)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc(wf()).s.takeAction('bad', 'sch', 1, 'approve', me)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc(null).s.takeAction(OID(), 'sch', 1, 'approve', me)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('NO SELF-APPROVAL: the initiator (by id or name) cannot approve their own request even when they are the assignee; the owner can', async () => {
    const own = svc(wf({ initiatedById: ME, initiatedBy: 'Approver One' }));
    await expect(own.s.takeAction(OID(), 'sch', 1, 'approve', me)).rejects.toThrow(/own request/);
    expect(own.saved).not.toHaveBeenCalled();
    const byName = svc(wf({ initiatedById: undefined, initiatedBy: 'approver one' }));
    await expect(byName.s.takeAction(OID(), 'sch', 1, 'approve', me)).rejects.toBeInstanceOf(ForbiddenException);
    const owner = svc(wf({ initiatedById: ME, initiatedBy: 'Approver One' }));
    await owner.s.takeAction(OID(), 'sch', 1, 'approve', { ...me, role: 'institution_owner' });
    expect(owner.saved).toHaveBeenCalled();
  });
  it('cancel: the initiator or the owner only, and only while it is running', async () => {
    const init = { userId: ME, name: 'Init', role: 'teacher' };
    const mine = svc(wf({ initiatedById: ME, initiatedBy: 'Init' }));
    await expect(mine.s.cancelWorkflow(OID(), 'sch', 'Init', 'changed my mind', init)).resolves.toMatchObject({ status: 'cancelled' });
    await expect(svc(wf()).s.cancelWorkflow(OID(), 'sch', 'X', 'r', { userId: OID(), name: 'X', role: 'principal' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc(wf({ status: 'approved' })).s.cancelWorkflow(OID(), 'sch', 'Init', 'r', { ...init })).rejects.toBeInstanceOf(ConflictException);
    await expect(svc(wf()).s.cancelWorkflow(OID(), 'sch', 'O', 'r', { userId: OID(), name: 'O', role: 'institution_owner' })).resolves.toMatchObject({ status: 'cancelled' });
    await expect(svc(null).s.cancelWorkflow(OID(), 'sch', 'O', 'r', init)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('the controller passes the signed-in user, ignoring actionBy in the body, and stamps the initiator id on start', async () => {
    const calls: any[] = [];
    const service: any = { takeAction: async (...a: any[]) => { calls.push(['action', ...a]); return {}; }, initiateWorkflow: async (...a: any[]) => { calls.push(['init', ...a]); return {}; } };
    const c = new DocumentsController(service);
    const req = { user: { userId: ME, name: 'Real Name', role: 'teacher', schoolSlug: 'sch' }, headers: {} };
    await c.takeAction('id', { stepOrder: 1, action: 'approve', actionBy: 'Spoofed Person' }, req);
    expect(calls[0][5].name).toBe('Real Name');
    expect(JSON.stringify(calls[0])).not.toContain('Spoofed Person');
    await c.initiateWorkflow({ templateId: 't', initiatedBy: 'Spoof', initiatedById: OTHER }, req);
    expect(calls[1][1]).toMatchObject({ initiatedBy: 'Real Name', initiatedById: ME });
  });
});

// ---------------------------------------------------------------- substitutions
describe('substitution (cover) routes', () => {
  const ORGANISE = ['generateForAbsence', 'assign', 'cancel'];
  it('organising cover is TEACHING_ADMIN_ROLES (+ teaching sub-module grant); suggestions need view; completing stays with the staff-write guard', () => {
    const P: any = SubstitutionController.prototype;
    for (const h of ORGANISE) expect(Reflect.getMetadata(ROLES_OR_MODULE_KEY, P[h])).toMatchObject({ moduleKey: 'teaching', roles: TEACHING_ADMIN_ROLES, level: 'manage' });
    expect(Reflect.getMetadata(ROLES_OR_MODULE_KEY, P.suggestSubstitutes)).toMatchObject({ roles: TEACHING_ADMIN_ROLES, level: 'view' });
    expect(Reflect.getMetadata(ROLES_OR_MODULE_KEY, P.complete).roles).toEqual(STAFF_WRITE_ROLES);
  });
  it('the real guard: teachers, librarians, parents refused; admin roles pass; the stock module-wide Teacher custom role does NOT unlock it', async () => {
    const none = customGuard(null);
    for (const h of ORGANISE) {
      for (const role of ['teacher', 'librarian', 'support_staff', 'parent', 'student']) expect(await modAllows(none, SubstitutionController, h, { userId: 'u', role })).toBe(false);
      for (const role of ['principal', 'vice_principal', 'admin', 'academic_coordinator', 'institution_owner']) expect(await modAllows(none, SubstitutionController, h, { userId: 'u', role })).toBe(true);
      expect(await modAllows(customGuard([{ moduleKey: 'teaching', level: 'manage' }]), SubstitutionController, h, { userId: 'u', role: 'teacher' })).toBe(false);
      expect(await modAllows(customGuard([{ moduleKey: 'teaching', subModuleKey: 'substitution', level: 'manage' }]), SubstitutionController, h, { userId: 'u', role: 'support_staff' })).toBe(true);
    }
  });
  const staffId = OID();
  function svc(fixture: any) {
    const s: any = Object.create(SubstitutionService.prototype);
    s.substitutionModel = {
      findOne: jest.fn(() => Object.assign(Promise.resolve(fixture ? { ...fixture, save: async () => undefined } : null), { select: () => ({ lean: async () => fixture }) })),
      findOneAndUpdate: jest.fn(async () => (fixture && ['open', 'assigned'].includes(fixture.status) ? fixture : null)),
    };
    s.staffModel = { findOne: () => ({ lean: async () => ({ _id: staffId }) }), findById: () => ({ lean: async () => ({ firstName: 'S', lastName: 'T' }) }) };
    s.teacherProfileModel = { findOne: () => ({ select: () => ({ lean: async () => null }) }) };
    s.getBusyTeacherIds = async () => new Set();
    return s as SubstitutionService;
  }
  it('NO SELF-ASSIGNMENT: the absent teacher cannot assign cover for their own absence; another admin can', async () => {
    const fx = { status: 'open', originalTeacherId: new Types.ObjectId(staffId), dayOfWeek: 1, periodNo: 1, date: new Date() };
    await expect(svc(fx).assignSubstitute(OID(), 't', OID(), 'Coordinator', { role: 'academic_coordinator', userId: ME } as any)).rejects.toThrow(/own absence/);
    const s2: any = svc({ ...fx, originalTeacherId: new Types.ObjectId() });
    s2.notifier = undefined;
    await expect(s2.assignSubstitute(OID(), 't', OID(), 'Coordinator', { role: 'academic_coordinator', userId: ME } as any)).resolves.toBeDefined();
  });
  it('cancel: a finished fixture is a 409, unknown 404, bad id 400', async () => {
    await expect(svc({ status: 'completed' }).cancelFixture(OID(), 't')).rejects.toBeInstanceOf(ConflictException);
    await expect(svc(null).cancelFixture(OID(), 't')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc({ status: 'open' }).cancelFixture('bad', 't')).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc({ status: 'assigned' }).cancelFixture(OID(), 't')).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------- assessment status
describe('PATCH /assessments/:id/status', () => {
  it('is guarded with the staff-write guard (was open to any token)', () => {
    expect(Reflect.getMetadata(ROLES_OR_MODULE_KEY, (AssessmentController.prototype as any).updateStatus)).toMatchObject({ moduleKey: 'assessments', allowModuleWide: true, roles: STAFF_WRITE_ROLES });
  });
  function svc(existingStatus: string | null) {
    const calls: any[] = [];
    const s: any = Object.create(AssessmentService.prototype);
    s.assessmentModel = {
      findOne: () => ({ select: () => ({ lean: async () => (existingStatus ? { status: existingStatus } : null) }) }),
      findOneAndUpdate: jest.fn(async (_f: any, u: any) => { calls.push(u.$set); return { status: u.$set.status }; }),
    };
    return { s: s as AssessmentService, calls };
  }
  it('a teacher moves an assessment through draft / scheduled / ongoing / completed / cancelled (their workflow is unchanged)', async () => {
    for (const status of ['scheduled', 'ongoing', 'completed', 'cancelled', 'draft']) {
      const { s, calls } = svc('draft');
      await s.updateStatus(OID(), 'sch', status, { role: 'teacher' });
      expect(calls[0]).toEqual({ status });
    }
  });
  it('publishing results (and withdrawing them) is for the admin roles; a teacher gets 403 and nothing changes', async () => {
    const pub = svc('completed');
    await expect(pub.s.updateStatus(OID(), 'sch', 'result_published', { role: 'teacher' })).rejects.toBeInstanceOf(ForbiddenException);
    const unpub = svc('result_published');
    await expect(unpub.s.updateStatus(OID(), 'sch', 'ongoing', { role: 'teacher' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(pub.calls).toEqual([]); expect(unpub.calls).toEqual([]);
    for (const role of ['principal', 'admin', 'vice_principal', 'academic_coordinator', 'institution_owner', 'super_admin']) {
      const ok = svc('completed');
      await ok.s.updateStatus(OID(), 'sch', 'result_published', { role });
      expect(ok.calls[0]).toEqual({ status: 'result_published' });
    }
  });
  it('a value that is not a real status is a 400 (any string used to be stored); unknown 404; bad id 400', async () => {
    for (const bad of ['', 'approved', 'DROP', undefined as any]) await expect(svc('draft').s.updateStatus(OID(), 'sch', bad, { role: 'admin' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc(null).s.updateStatus(OID(), 'sch', 'draft', { role: 'admin' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc('draft').s.updateStatus('bad', 'sch', 'draft', { role: 'admin' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
