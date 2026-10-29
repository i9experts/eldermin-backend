import 'reflect-metadata';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Types } from 'mongoose';
import { BehaviourController } from './behaviour.controller';
import { BehaviourService } from './behaviour.service';
import { RolesOrModuleManageGuard } from '../roles/guards/roles-or-module-manage.guard';
import { ROLES_OR_MODULE_KEY } from '../roles/decorators/roles-or-module-manage.decorator';
import { customRoleGrants } from '../roles/module-access.util';
import { TEACHING_ADMIN_ROLES, STAFF_WRITE_ROLES } from '../auth/role-sets';

const omitStamp = (o: any) => { const { updatedBy, updatedById, ...rest } = o || {}; return rest; };

const PROTO: any = BehaviourController.prototype;
const COUNSELLING: Array<[string, 'view' | 'manage']> = [['getCounselling', 'view'], ['createCounselling', 'manage'], ['updateCounselling', 'manage'], ['completeCounselling', 'manage']];
const INTERVENTIONS: Array<[string, 'view' | 'manage']> = [['getInterventions', 'view'], ['createIntervention', 'manage'], ['updateIntervention', 'manage'], ['addProgress', 'manage'], ['updateAction', 'manage']];

function guardFor(moduleAccess: any[] | null, customRoleId: any = 'cr1') {
  const userModel: any = { findById: () => ({ select: () => ({ lean: async () => ({ customRoleId: moduleAccess ? customRoleId : null }) }) }) };
  const roleModel: any = { findById: () => ({ select: () => ({ lean: async () => (moduleAccess ? { moduleAccess } : null) }) }) };
  return new RolesOrModuleManageGuard(new Reflector(), roleModel, userModel);
}
const ctx = (handler: string, user: any): any => ({ getHandler: () => PROTO[handler], getClass: () => BehaviourController, switchToHttp: () => ({ getRequest: () => ({ user }) }) });
const allowed = async (g: RolesOrModuleManageGuard, h: string, user: any) => { try { return await g.canActivate(ctx(h, user)); } catch (e) { if (e instanceof ForbiddenException) return false; throw e; } };

describe('counselling and interventions are confidential (round 2)', () => {
  it('every counselling/intervention route (reads AND writes) is guarded with the admin roles + its own sub-module, read=view write=manage', () => {
    for (const [h, level] of COUNSELLING) expect(Reflect.getMetadata(ROLES_OR_MODULE_KEY, PROTO[h])).toMatchObject({ moduleKey: 'behaviour', level, subModuleKey: 'counselling', roles: TEACHING_ADMIN_ROLES });
    for (const [h, level] of INTERVENTIONS) expect(Reflect.getMetadata(ROLES_OR_MODULE_KEY, PROTO[h])).toMatchObject({ moduleKey: 'behaviour', level, subModuleKey: 'interventions', roles: TEACHING_ADMIN_ROLES });
  });
  it('teachers and every non-admin base role are refused on every one of those routes (no custom role)', async () => {
    const g = guardFor(null);
    for (const role of ['teacher', 'librarian', 'support_staff', 'hr_manager', 'finance_manager', 'parent', 'student', 'reseller_admin']) {
      for (const [h] of [...COUNSELLING, ...INTERVENTIONS]) expect(await allowed(g, h, { userId: 'u', role })).toBe(false);
    }
  });
  it('admin roles keep access to all of them', async () => {
    const g = guardFor(null);
    for (const role of ['institution_owner', 'principal', 'vice_principal', 'admin', 'academic_coordinator', 'super_admin']) {
      for (const [h] of [...COUNSELLING, ...INTERVENTIONS]) expect(await allowed(g, h, { userId: 'u', role })).toBe(true);
    }
  });
  it('the stock Teacher custom role (behaviour:manage MODULE-WIDE) does NOT unlock them; neither does another behaviour sub-module', async () => {
    for (const access of [[{ moduleKey: 'behaviour', level: 'manage' }], [{ moduleKey: 'behaviour', subModuleKey: 'records', level: 'manage' }], [{ moduleKey: 'behaviour', subModuleKey: 'tarbiyah', level: 'manage' }]]) {
      const g = guardFor(access);
      for (const [h] of [...COUNSELLING, ...INTERVENTIONS]) expect(await allowed(g, h, { userId: 'u', role: 'teacher' })).toBe(false);
    }
  });
  it('a custom role with exactly behaviour:counselling:view reads counselling but cannot write it and cannot touch interventions', async () => {
    const g = guardFor([{ moduleKey: 'behaviour', subModuleKey: 'counselling', level: 'view' }]);
    const u = { userId: 'u', role: 'support_staff' };
    expect(await allowed(g, 'getCounselling', u)).toBe(true);
    expect(await allowed(g, 'createCounselling', u)).toBe(false);
    expect(await allowed(g, 'updateCounselling', u)).toBe(false);
    for (const [h] of INTERVENTIONS) expect(await allowed(g, h, u)).toBe(false);
  });
  it('behaviour:counselling:manage reads and writes counselling; behaviour:interventions:manage does the same for interventions only', async () => {
    const c = guardFor([{ moduleKey: 'behaviour', subModuleKey: 'counselling', level: 'manage' }]);
    for (const [h] of COUNSELLING) expect(await allowed(c, h, { userId: 'u', role: 'support_staff' })).toBe(true);
    for (const [h] of INTERVENTIONS) expect(await allowed(c, h, { userId: 'u', role: 'support_staff' })).toBe(false);
    const i = guardFor([{ moduleKey: 'behaviour', subModuleKey: 'interventions', level: 'manage' }]);
    for (const [h] of INTERVENTIONS) expect(await allowed(i, h, { userId: 'u', role: 'support_staff' })).toBe(true);
    for (const [h] of COUNSELLING) expect(await allowed(i, h, { userId: 'u', role: 'support_staff' })).toBe(false);
  });
  it('a parent/student/reseller token is never let in through a custom role', async () => {
    const g = guardFor([{ moduleKey: 'behaviour', subModuleKey: 'counselling', level: 'manage' }]);
    for (const role of ['parent', 'student', 'reseller_admin']) expect(await allowed(g, 'getCounselling', { userId: 'u', role })).toBe(false);
  });
  it('existing routes WITHOUT a sub-module key behave exactly as before (module-wide still passes where it did)', () => {
    expect(customRoleGrants([{ moduleKey: 'behaviour', level: 'manage' }], 'behaviour', 'manage', true)).toBe(true);
    // sub-module-tied route, allowModuleWide=false (confidential): the module-wide grant does NOT count
    expect(customRoleGrants([{ moduleKey: 'behaviour', level: 'manage' }], 'behaviour', 'manage', false, 'counselling')).toBe(false);
    // ... with allowModuleWide=true (e.g. institution admins on approvals) a module-wide grant counts, a sibling sub-module still does not
    expect(customRoleGrants([{ moduleKey: 'behaviour', level: 'manage' }], 'behaviour', 'manage', true, 'counselling')).toBe(true);
    expect(customRoleGrants([{ moduleKey: 'behaviour', subModuleKey: 'records', level: 'manage' }], 'behaviour', 'manage', true, 'counselling')).toBe(false);
    expect(customRoleGrants([{ moduleKey: 'behaviour', subModuleKey: 'counselling', level: 'view' }], 'behaviour', 'manage', false, 'counselling')).toBe(false);
  });
});

describe('Tarbiyah PUT: author or admin only (round 2)', () => {
  const ME = new Types.ObjectId().toHexString(), OTHER = new Types.ObjectId().toHexString(), ID = new Types.ObjectId().toHexString();
  function svc(existing: any) {
    const calls: any[] = [];
    const s: any = Object.create(BehaviourService.prototype);
    s.tarbiyahModel = {
      findOne: jest.fn(() => ({ select: () => ({ lean: async () => existing }) })),
      findOneAndUpdate: jest.fn(async (f: any, u: any) => { calls.push(u.$set); return { ...existing, ...u.$set, studentId: 's' }; }),
      db: {},
    };
    s.getCharacterSettings = async () => ({ ratingScale: { min: 1, max: 5 } });
    return { s: s as BehaviourService, calls, model: s.tarbiyahModel };
  }
  const user = (role: string, id = ME) => ({ role, userId: id } as any);
  it('the author edits their own assessment; ownership/tenancy fields are dropped, the parent-share toggle and traits still work', async () => {
    const { s, calls } = svc({ assessedById: new Types.ObjectId(ME) });
    await s.updateTarbiyahAssessment(ID, 'sch', { teacherObservations: 'x', assessedBy: 'evil', assessedById: OTHER, schoolSlug: 'other', studentId: OTHER, parentShared: false }, user('teacher'));
    expect(omitStamp(calls[0])).toEqual({ teacherObservations: 'x', parentShared: false });
  });
  it("another teacher's assessment and a legacy one without an author are 403, nothing written", async () => {
    for (const existing of [{ assessedById: new Types.ObjectId(OTHER) }, {}]) {
      const { s, model } = svc(existing);
      await expect(s.updateTarbiyahAssessment(ID, 'sch', { teacherObservations: 'x' }, user('teacher'))).rejects.toBeInstanceOf(ForbiddenException);
      expect(model.findOneAndUpdate).not.toHaveBeenCalled();
    }
  });
  it.each(['principal', 'admin', 'vice_principal', 'academic_coordinator', 'institution_owner', 'super_admin'])('%s keeps full edit of any assessment', async (role) => {
    const { s, calls } = svc({ assessedById: new Types.ObjectId(OTHER) });
    await s.updateTarbiyahAssessment(ID, 'sch', { assessedBy: 'new', teacherObservations: 'y' }, user(role));
    expect(omitStamp(calls[0])).toEqual({ assessedBy: 'new', teacherObservations: 'y' });
  });
  it('unknown id -> 404, malformed id -> 400', async () => {
    await expect(svc(null).s.updateTarbiyahAssessment(ID, 'sch', {}, user('teacher'))).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc({}).s.updateTarbiyahAssessment('bad', 'sch', {}, user('teacher'))).rejects.toThrow(/Invalid/i);
  });
  it('create: a non-admin is always recorded as themselves (the PUT rule needs a reliable author); an admin may name one', async () => {
    const created: any[] = [];
    const service: any = { createTarbiyahAssessment: jest.fn(async (_s: string, b: any) => { created.push(b); return b; }) };
    const ctrl = new BehaviourController(service);
    const req = (role: string) => ({ user: { role, userId: ME, name: 'Me', schoolSlug: 'sch' }, headers: {} });
    await ctrl.createTarbiyah({ studentId: 's', assessedBy: 'Spoof', assessedById: OTHER, traits: [] }, req('teacher'));
    expect(created[0]).toMatchObject({ assessedById: ME, assessedBy: 'Me' });
    await ctrl.createTarbiyah({ studentId: 's', assessedBy: 'Counsellor X', assessedById: OTHER }, req('principal'));
    expect(created[1]).toMatchObject({ assessedById: OTHER, assessedBy: 'Counsellor X' });
    await ctrl.createTarbiyah({ studentId: 's' }, req('principal'));
    expect(created[2].assessedById).toBe(ME);
  });
  it('PUT tarbiyah keeps its staff-write guard (parents/students still blocked)', () => {
    expect(Reflect.getMetadata(ROLES_OR_MODULE_KEY, PROTO.updateTarbiyah).roles).toEqual(STAFF_WRITE_ROLES);
  });
});
