import { ServiceUnavailableException } from '@nestjs/common';
import { AccountAccessService, staffRevokesAccess } from './account-access.service';
import { CriticalAuditService } from '../../common/critical-audit.service';
import { idForms } from '../../common/utils/id-forms.util';
import { Types } from 'mongoose';

const UID = new Types.ObjectId().toHexString();

function build(user: any, opts: { modified?: number[]; auditFails?: boolean; tenantSlug?: string } = {}) {
  const updates: any[] = [];
  const mods = [...(opts.modified || [1])];
  const userModel: any = {
    findOne: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve(user) }) })),
    updateOne: jest.fn(async (f: any, u: any, o: any) => { if (Array.isArray(u) && !(o && o.updatePipeline === true)) throw new Error('Cannot pass an array to query updates unless the `updatePipeline` option is set.'); updates.push({ f, u }); return { modifiedCount: mods.length ? mods.shift() : 0 }; }),
  };
  const tenantModel: any = { findOne: () => ({ select: () => ({ lean: () => Promise.resolve({ slug: opts.tenantSlug ?? 'sch' }) }) }) };
  const rows: any[] = [];
  const auditModel: any = {
    create: jest.fn(async (d: any) => { if (opts.auditFails) throw new Error('audit down'); rows.push(d); return { _id: 'a' + rows.length, ...d }; }),
    updateOne: jest.fn(async () => ({})),
  };
  const svc = new AccountAccessService(userModel, tenantModel, auditModel, new CriticalAuditService(auditModel), { invalidate: jest.fn() } as any);
  return { svc, userModel, updates, rows, auditModel };
}
const staffUser = (over: any = {}) => ({ _id: UID, primaryRole: 'teacher', isActive: true, tenantId: 't1', guardianOfStudentIds: [], linkedStudentId: null, customRoleId: null, ...over });

describe('AccountAccessService.deactivateStaffLogin', () => {
  it('plain staff login: isActive=false + deactivation fields, reset token cleared, audited', async () => {
    const { svc, updates, rows } = build(staffUser());
    await expect(svc.deactivateStaffLogin(UID, 'staff_deleted', 'actor1', { name: 'HR' })).resolves.toEqual({ outcome: 'deactivated' });
    expect(updates[0].f).toMatchObject({ isActive: { $ne: false } });
    const set = updates[0].u[0].$set;
    expect(set.isActive).toBe(false); expect(set.deactivationReason).toEqual({ $literal: 'staff_deleted' }); expect(set.deactivatedAt).toBeInstanceOf(Date);
    expect(updates[0].u[1].$unset).toEqual(['resetPasswordTokenHash', 'resetPasswordExpires']);
    expect(rows[0]).toMatchObject({ module: 'Account Access', action: 'Deactivate login', schoolSlug: 'sch', performedById: 'actor1' });
  });

  it('idempotent: second call (nothing modified) reports already and writes no second audit row', async () => {
    const { svc, rows } = build(staffUser(), { modified: [1, 0] });
    await svc.deactivateStaffLogin(UID, 'r', 'a');
    await expect(svc.deactivateStaffLogin(UID, 'r', 'a')).resolves.toEqual({ outcome: 'already' });
    expect(rows).toHaveLength(1);
  });

  it('shared staff+guardian account is DEMOTED to parent, not deactivated (guardian links kept)', async () => {
    const { svc, updates } = build(staffUser({ guardianOfStudentIds: [new Types.ObjectId()], customRoleId: new Types.ObjectId() }));
    await expect(svc.deactivateStaffLogin(UID, 'staff_deleted', 'a')).resolves.toEqual({ outcome: 'demoted' });
    const set = updates[0].u[0].$set;
    expect(set).toMatchObject({ primaryRole: 'parent', customRoleId: null, previousPrimaryRole: '$primaryRole' });
    expect(set.isActive).toBeUndefined();
    expect(set.guardianOfStudentIds).toBeUndefined(); expect(set.linkedStudentId).toBeUndefined();
    expect(updates[0].f.staffAccessRevokedAt).toEqual({ $exists: false });
  });

  it('shared via linkedStudentId is also demoted; demotion is idempotent', async () => {
    const { svc } = build(staffUser({ linkedStudentId: new Types.ObjectId() }), { modified: [1, 0] });
    expect((await svc.deactivateStaffLogin(UID, 'r', 'a')).outcome).toBe('demoted');
    expect((await svc.deactivateStaffLogin(UID, 'r', 'a')).outcome).toBe('already');
  });

  it.each(['institution_owner', 'super_admin'])('%s is never touched', async (role) => {
    const { svc, userModel } = build(staffUser({ primaryRole: role }));
    await expect(svc.deactivateStaffLogin(UID, 'r', 'a')).resolves.toEqual({ outcome: 'protected' });
    expect(userModel.updateOne).not.toHaveBeenCalled();
  });

  it.each(['parent', 'student'])('%s account is not a staff login: untouched', async (role) => {
    const { svc, userModel } = build(staffUser({ primaryRole: role }));
    await expect(svc.deactivateStaffLogin(UID, 'r', 'a')).resolves.toEqual({ outcome: 'not_staff' });
    expect(userModel.updateOne).not.toHaveBeenCalled();
  });

  it('missing user / no id -> no_user, nothing written', async () => {
    const { svc, userModel } = build(null);
    await expect(svc.deactivateStaffLogin(UID, 'r')).resolves.toEqual({ outcome: 'no_user' });
    await expect(svc.deactivateStaffLogin(null, 'r')).resolves.toEqual({ outcome: 'no_user' });
    expect(userModel.updateOne).not.toHaveBeenCalled();
  });

  it('a failing audit store never blocks the removal (best effort)', async () => {
    const { svc } = build(staffUser(), { auditFails: true });
    await expect(svc.deactivateStaffLogin(UID, 'r', 'a')).resolves.toEqual({ outcome: 'deactivated' });
  });
});

describe('AccountAccessService.reactivateStaffLogin', () => {
  it('restores a deactivated login and writes a pending->applied audit entry (who/why)', async () => {
    const { svc, updates, rows } = build(staffUser({ isActive: false, deactivatedAt: new Date(), deactivationReason: 'staff_deleted' }));
    await expect(svc.reactivateStaffLogin(UID, 'rehired', 'hrAdmin', { name: 'HR Admin' })).resolves.toEqual({ outcome: 'reactivated' });
    expect(updates[0].u[0].$set.isActive).toBe(true);
    expect(updates[0].u[1].$unset).toEqual(expect.arrayContaining(['deactivatedAt', 'deactivationReason', 'staffAccessRevokedAt']));
    expect(rows[0]).toMatchObject({ action: 'Reactivate login', module: 'Account Access', performedById: 'hrAdmin', outcome: 'pending' });
    expect(rows[0].newValue).toContain('rehired');
  });

  it('a demoted shared account gets its previous role and custom role back', async () => {
    const { svc, updates } = build(staffUser({ primaryRole: 'parent', staffAccessRevokedAt: new Date(), previousPrimaryRole: 'teacher' }));
    await svc.reactivateStaffLogin(UID, 'rehired', 'hr');
    const set = updates[0].u[0].$set;
    expect(set.primaryRole).toEqual({ $ifNull: ['$previousPrimaryRole', '$primaryRole'] });
    expect(set.customRoleId).toEqual({ $ifNull: ['$previousCustomRoleId', null] });
  });

  it('already-active, never-demoted user -> noop, no write, no audit', async () => {
    const { svc, userModel, rows } = build(staffUser());
    await expect(svc.reactivateStaffLogin(UID, 'x', 'hr')).resolves.toEqual({ outcome: 'noop' });
    expect(userModel.updateOne).not.toHaveBeenCalled(); expect(rows).toHaveLength(0);
  });

  it('FAIL-CLOSED: audit store down -> 503 and the user is NOT reactivated', async () => {
    const { svc, userModel } = build(staffUser({ isActive: false }), { auditFails: true });
    await expect(svc.reactivateStaffLogin(UID, 'x', 'hr')).rejects.toThrow(ServiceUnavailableException);
    expect(userModel.updateOne).not.toHaveBeenCalled();
  });
});

describe('AccountAccessService.changeBaseRole (D4)', () => {
  it('changes the role, bumps tokenVersion in the same update, invalidates the cache and writes a fail-closed audit row', async () => {
    const { svc, updates, rows } = build(staffUser({ primaryRole: 'teacher' }));
    await expect(svc.changeBaseRole(UID, 'academic_coordinator', 'promoted', 'hr1', { name: 'HR' })).resolves.toEqual({ outcome: 'changed' });
    expect(updates[0].f).toMatchObject({ primaryRole: 'teacher' });
    expect(updates[0].u).toEqual({ $set: { primaryRole: 'academic_coordinator' }, $inc: { tokenVersion: 1 } });
    expect(rows[0]).toMatchObject({ module: 'Account Access', action: 'Change base role', performedById: 'hr1', outcome: 'pending' });
    expect(rows[0].newValue).toContain('promoted');
  });
  it('same role -> noop, no write, no audit', async () => {
    const { svc, userModel, rows } = build(staffUser({ primaryRole: 'teacher' }));
    await expect(svc.changeBaseRole(UID, 'teacher', 'x', 'hr1')).resolves.toEqual({ outcome: 'noop' });
    expect(userModel.updateOne).not.toHaveBeenCalled(); expect(rows).toHaveLength(0);
  });
  it.each(['super_admin', 'institution_owner', 'parent', 'student', 'reseller_admin'])('never changes TO %s', async (role) => {
    const { svc, userModel } = build(staffUser());
    await expect(svc.changeBaseRole(UID, role, 'x', 'hr1')).resolves.toEqual({ outcome: 'protected' });
    expect(userModel.updateOne).not.toHaveBeenCalled();
  });
  it.each([['institution_owner', 'protected'], ['super_admin', 'protected'], ['parent', 'not_staff'], ['student', 'not_staff']])('never changes FROM %s', async (from, expected) => {
    const { svc, userModel } = build(staffUser({ primaryRole: from }));
    await expect(svc.changeBaseRole(UID, 'teacher', 'x', 'hr1')).resolves.toEqual({ outcome: expected });
    expect(userModel.updateOne).not.toHaveBeenCalled();
  });
  it('unknown role string and missing user are rejected without a write', async () => {
    const a = build(staffUser());
    await expect(a.svc.changeBaseRole(UID, 'god_mode', 'x', 'hr1')).resolves.toEqual({ outcome: 'invalid_role' });
    const b = build(null);
    await expect(b.svc.changeBaseRole(UID, 'teacher', 'x', 'hr1')).resolves.toEqual({ outcome: 'no_user' });
    expect(a.userModel.updateOne).not.toHaveBeenCalled(); expect(b.userModel.updateOne).not.toHaveBeenCalled();
  });
  it('FAIL-CLOSED: audit store down -> 503 and the role is NOT changed', async () => {
    const { svc, userModel } = build(staffUser(), { auditFails: true });
    await expect(svc.changeBaseRole(UID, 'academic_coordinator', 'x', 'hr1')).rejects.toThrow(ServiceUnavailableException);
    expect(userModel.updateOne).not.toHaveBeenCalled();
  });
});

describe('helpers', () => {
  it('staffRevokesAccess: resigned/terminated/suspended or isActive=false; on_leave/probation/active do not', () => {
    for (const s of ['resigned', 'terminated', 'suspended']) expect(staffRevokesAccess(s, true)).toBe(true);
    expect(staffRevokesAccess('active', false)).toBe(true);
    for (const s of ['active', 'on_leave', 'probation', undefined]) expect(staffRevokesAccess(s as any, true)).toBe(false);
  });
  it('idForms matches both id storage types', () => {
    expect((idForms(UID) as any).$in.map(String)).toEqual([UID, UID]);
    expect(idForms('not-an-id')).toBe('not-an-id');
  });
});
