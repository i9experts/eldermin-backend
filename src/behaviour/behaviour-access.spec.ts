import 'reflect-metadata';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { BehaviourService } from './behaviour.service';
import { BehaviourController } from './behaviour.controller';
import { ROLES_OR_MODULE_KEY } from '../roles/decorators/roles-or-module-manage.decorator';
import { STAFF_WRITE_ROLES } from '../auth/role-sets';
import { UserRole } from '../auth/roles.enum';

const REC = new Types.ObjectId().toHexString();
const ME = new Types.ObjectId().toHexString();
const OTHER = new Types.ObjectId().toHexString();

function svcWith(existing: any) {
  const calls: any[] = [];
  const svc: any = Object.create(BehaviourService.prototype);
  svc.recordModel = {
    findOne: jest.fn(() => ({ lean: () => Promise.resolve(existing) })),
    findOneAndUpdate: jest.fn(async (f: any, u: any) => { calls.push({ f, u }); return existing ? { ...existing, ...u.$set } : null; }),
  };
  return { svc: svc as BehaviourService, calls, model: svc.recordModel };
}
const teacher = (id = ME) => ({ role: 'teacher', userId: id });

describe('behaviour record resolve route (D7)', () => {
  it('is guarded with the same staff-write guard as create/edit (was open to every token)', () => {
    const m = Reflect.getMetadata(ROLES_OR_MODULE_KEY, (BehaviourController.prototype as any).resolveRecord);
    expect(m).toMatchObject({ moduleKey: 'behaviour', allowModuleWide: true });
    expect(m.roles).toEqual(STAFF_WRITE_ROLES);
    for (const r of [UserRole.PARENT, UserRole.STUDENT, UserRole.RESELLER_ADMIN, UserRole.RESELLER_SUPPORT]) expect(m.roles).not.toContain(r);
    expect(m.roles).toContain(UserRole.TEACHER);
  });
  it('unknown record -> 404 (was 200 with null)', async () => {
    const { svc } = svcWith(null);
    (svc as any).recordModel.findOneAndUpdate = jest.fn(async () => null);
    await expect(svc.resolveRecord(REC, 's', 'n', 'T')).rejects.toBeInstanceOf(NotFoundException);
  });
  it('resolves a record and stamps who resolved it', async () => {
    const { svc, calls } = svcWith({ _id: REC });
    await svc.resolveRecord(REC, 's', 'talked to parents', 'T. Name');
    expect(calls[0].u.$set).toMatchObject({ resolved: true, resolvedNote: 'talked to parents', verifiedBy: 'T. Name' });
    expect(calls[0].f).toEqual({ _id: REC, schoolSlug: 's' });
  });
  it('malformed id is a 400, not a 500', async () => {
    const { svc } = svcWith({});
    await expect(svc.resolveRecord('nope', 's', 'n', 'T')).rejects.toThrow(/Invalid/i);
  });
});

describe('PUT /behaviour/records/:id ownership (D7)', () => {
  it('teacher edits their OWN record (ObjectId or string stored id); ownership/tenancy/resolve fields are dropped', async () => {
    for (const stored of [new Types.ObjectId(ME), ME]) {
      const { svc, calls } = svcWith({ _id: REC, reportedById: stored });
      await svc.updateRecord(REC, 's', { title: 'x', reportedBy: 'evil', reportedById: OTHER, schoolSlug: 'other', campusId: 'c', verifiedBy: 'me', verified: true, resolved: true, resolvedNote: 'n' }, teacher() as any);
      expect(calls[0].u.$set).toEqual({ title: 'x' });
    }
  });
  it("teacher cannot edit someone else's record (403) and nothing is written", async () => {
    const { svc, model } = svcWith({ _id: REC, reportedById: new Types.ObjectId(OTHER) });
    await expect(svc.updateRecord(REC, 's', { title: 'x' }, teacher() as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it('legacy record with no reportedById is not editable by a teacher (fail closed)', async () => {
    const { svc, model } = svcWith({ _id: REC });
    await expect(svc.updateRecord(REC, 's', { title: 'x' }, teacher() as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it('a custom-role user with a non-admin base role is treated like a teacher (own records only)', async () => {
    const { svc } = svcWith({ _id: REC, reportedById: OTHER });
    await expect(svc.updateRecord(REC, 's', { title: 'x' }, { role: 'support_staff', userId: ME } as any)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it.each(['principal', 'admin', 'vice_principal', 'academic_coordinator', 'institution_owner', 'super_admin'])('%s keeps full edit (any record, all fields): today\'s behaviour', async (role) => {
    const { svc, calls } = svcWith({ _id: REC, reportedById: OTHER });
    await svc.updateRecord(REC, 's', { title: 'x', resolved: true }, { role, userId: ME } as any);
    expect(calls[0].u.$set).toEqual({ title: 'x', resolved: true });
  });
  it('unknown record -> 404; malformed id -> 400 (never 500)', async () => {
    await expect(svcWith(null).svc.updateRecord(REC, 's', {}, teacher() as any)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svcWith({}).svc.updateRecord('bad', 's', {}, teacher() as any)).rejects.toThrow(/Invalid/i);
  });
  it('the school filter is part of the lookup (another school\'s record is a 404)', async () => {
    const { svc, model } = svcWith(null);
    await expect(svc.updateRecord(REC, 'mine', {}, { role: 'admin', userId: ME } as any)).rejects.toBeInstanceOf(NotFoundException);
    expect(model.findOne).toHaveBeenCalledWith({ _id: REC, schoolSlug: 'mine' });
  });
});
