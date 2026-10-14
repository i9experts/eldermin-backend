import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { RolesService, RoleActor } from './roles.service';
import { entriesAboveCeiling, entriesWithUnknownKeys } from './role-grant.util';

const T1 = new Types.ObjectId().toHexString();
const T2 = new Types.ObjectId().toHexString();
const uid = () => new Types.ObjectId().toHexString();

function setup(opts: { users?: any[]; roles?: any[] } = {}) {
  const users = opts.users || [];
  const roles = opts.roles || [];
  const chain = (v: any) => ({ select: () => ({ lean: () => Promise.resolve(v) }), lean: () => Promise.resolve(v), then: (r: any) => Promise.resolve(v).then(r) });
  const userModel: any = {
    findById: jest.fn((id: string) => chain(users.find(u => String(u._id) === String(id)) || null)),
    findOne: jest.fn((q: any) => chain(users.find(u => String(u._id) === String(q._id) && String(u.tenantId) === String(q.tenantId)) || null)),
    findOneAndUpdate: jest.fn((q: any, upd: any) => ({ select: () => Promise.resolve(users.find(u => String(u._id) === String(q._id) && String(u.tenantId) === String(q.tenantId)) ? { _id: q._id, ...upd.$set } : null) })),
    countDocuments: jest.fn(() => Promise.resolve(0)),
  };
  const saved: any[] = [];
  const roleModel: any = function (this: any, d: any) { Object.assign(this, d); this.save = () => { saved.push(d); return Promise.resolve(this); }; };
  roleModel.findById = jest.fn((id: string) => chain(roles.find(r => String(r._id) === String(id)) || null));
  roleModel.findOne = jest.fn((q: any) => {
    const r = roles.find(x => (q._id ? String(x._id) === String(q._id) : true) && (q.schoolSlug ? x.schoolSlug === q.schoolSlug : true) && (q.name ? x.name === q.name : true));
    return Object.assign(Promise.resolve(r || null), { lean: () => Promise.resolve(r || null) });
  });
  const audit: any = { run: jest.fn((_a: any, _m: any, load: any, mut: any) => load().then(() => mut())) };
  return { svc: new RolesService(roleModel, userModel, audit), userModel, roleModel, saved, audit };
}

const actor = (over: Partial<RoleActor> = {}): RoleActor => ({ userId: uid(), role: 'admin', tenantId: T1, schoolSlug: 's1', userName: 'A', ...over });

describe('RolesService hardening', () => {
  it('assign: cross-tenant target is rejected (not found in caller tenant)', async () => {
    const target = { _id: uid(), tenantId: T2, primaryRole: 'teacher' };
    const { svc, userModel } = setup({ users: [target] });
    await expect(svc.assignRole(actor(), target._id, null)).rejects.toThrow(NotFoundException);
    expect(userModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('assign: self assignment / unassignment rejected', async () => {
    const a = actor();
    const { svc } = setup({ users: [{ _id: a.userId, tenantId: T1, primaryRole: 'admin' }] });
    await expect(svc.assignRole(a, a.userId, uid())).rejects.toThrow(ForbiddenException);
    await expect(svc.assignRole(a, a.userId, null)).rejects.toThrow(ForbiddenException);
  });

  it('assign: admin cannot touch an owner account', async () => {
    const target = { _id: uid(), tenantId: T1, primaryRole: 'institution_owner' };
    const { svc } = setup({ users: [target] });
    await expect(svc.assignRole(actor({ role: 'admin' }), target._id, null)).rejects.toThrow(ForbiddenException);
  });

  it('assign: parent/student targets cannot receive a custom role', async () => {
    const target = { _id: uid(), tenantId: T1, primaryRole: 'parent' };
    const { svc } = setup({ users: [target] });
    await expect(svc.assignRole(actor(), target._id, uid())).rejects.toThrow(BadRequestException);
  });

  it('assign: role above the caller own level (custom-role holder) rejected', async () => {
    const a = actor({ role: 'teacher' });
    const target = { _id: uid(), tenantId: T1, primaryRole: 'teacher' };
    const mine = { _id: uid(), schoolSlug: 's1', moduleAccess: [{ moduleKey: 'institution', level: 'manage' }] };
    const big = { _id: uid(), schoolSlug: 's1', moduleAccess: [{ moduleKey: 'finance', level: 'manage' }] };
    const { svc } = setup({ users: [{ _id: a.userId, tenantId: T1, primaryRole: 'teacher', customRoleId: mine._id }, target], roles: [mine, big] });
    await expect(svc.assignRole(a, target._id, big._id)).rejects.toThrow(/higher than your own/);
  });

  it('assign: admin may assign within the school (happy path)', async () => {
    const target = { _id: uid(), tenantId: T1, primaryRole: 'teacher' };
    const role = { _id: uid(), schoolSlug: 's1', moduleAccess: [{ moduleKey: 'finance', level: 'manage' }] };
    const { svc, userModel } = setup({ users: [target], roles: [role] });
    await svc.assignRole(actor(), target._id, role._id);
    expect(userModel.findOneAndUpdate).toHaveBeenCalled();
    expect(String(userModel.findOneAndUpdate.mock.calls[0][0].tenantId)).toBe(T1);
  });

  it('assign: role of another school is not found', async () => {
    const target = { _id: uid(), tenantId: T1, primaryRole: 'teacher' };
    const role = { _id: uid(), schoolSlug: 'other', moduleAccess: [] };
    const { svc } = setup({ users: [target], roles: [role] });
    await expect(svc.assignRole(actor(), target._id, role._id)).rejects.toThrow(NotFoundException);
  });

  it('update: cannot edit the role the caller holds', async () => {
    const role = { _id: uid(), schoolSlug: 's1', name: 'R', isSystemDefault: false, moduleAccess: [], save: jest.fn() };
    const a = actor({ role: 'teacher' });
    const { svc } = setup({ users: [{ _id: a.userId, tenantId: T1, customRoleId: role._id }], roles: [role] });
    await expect(svc.updateRole(a, role._id, { description: 'x' })).rejects.toThrow(/role you currently hold/);
    expect(role.save).not.toHaveBeenCalled();
  });

  it('create: custom-role holder cannot create a role above own level; admin can', async () => {
    const a = actor({ role: 'teacher' });
    const mine = { _id: uid(), schoolSlug: 's1', moduleAccess: [{ moduleKey: 'institution', level: 'manage' }] };
    const s1 = setup({ users: [{ _id: a.userId, tenantId: T1, customRoleId: mine._id }], roles: [mine] });
    await expect(s1.svc.createRole(a, { name: 'X', moduleAccess: [{ moduleKey: 'hr', level: 'manage' }] } as any)).rejects.toThrow(ForbiddenException);
    const s2 = setup();
    await expect(s2.svc.createRole(actor(), { name: 'X', moduleAccess: [{ moduleKey: 'hr', level: 'manage' }] } as any)).resolves.toBeDefined();
  });

  it('create: unknown module key rejected', async () => {
    await expect(setup().svc.createRole(actor(), { name: 'X', moduleAccess: [{ moduleKey: 'nope', level: 'view' }] } as any)).rejects.toThrow(BadRequestException);
  });
});

describe('role-grant.util', () => {
  it('module-wide request needs module-wide ceiling', () => {
    expect(entriesAboveCeiling([{ moduleKey: 'hr', subModuleKey: 'payroll', level: 'manage' }], [{ moduleKey: 'hr', level: 'view' }])).toHaveLength(1);
    expect(entriesAboveCeiling([{ moduleKey: 'hr', level: 'manage' }], [{ moduleKey: 'hr', subModuleKey: 'payroll', level: 'manage' }])).toHaveLength(0);
    expect(entriesAboveCeiling('unrestricted', [{ moduleKey: 'hr', level: 'manage' }])).toHaveLength(0);
  });
  it('unknown sub-module flagged', () => {
    expect(entriesWithUnknownKeys([{ moduleKey: 'hr', subModuleKey: 'zzz', level: 'view' }])).toHaveLength(1);
  });
});
