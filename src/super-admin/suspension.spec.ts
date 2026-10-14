import { SuperAdminService } from './super-admin.service';
import { PlatformStaffService } from './platform-staff.service';

function sa() {
  const svc: any = Object.create(SuperAdminService.prototype);
  const tenantUpdates: any[] = [];
  svc.institutionModel = { findOne: jest.fn(async () => ({ name: 'S' })), findOneAndUpdate: jest.fn(async () => ({})) };
  svc.tenantModel = { updateOne: jest.fn(async (f: any, u: any) => { tenantUpdates.push({ f, u }); return {}; }) };
  svc.subHistoryModel = function (this: any) { this.save = async () => ({}); } as any;
  return { svc, tenantUpdates };
}

describe('institution suspension is wired to Tenant.status (decision 10, flagged)', () => {
  it('suspend -> Tenant.status = suspended (so login refuses the whole school)', async () => {
    const { svc, tenantUpdates } = sa();
    await svc.updateInstitutionStatus('s1', 'suspended', 'unpaid', 'admin');
    expect(tenantUpdates).toEqual([{ f: { slug: 's1' }, u: { $set: { status: 'suspended' } } }]);
  });
  it('activate -> lifts ONLY a suspended tenant', async () => {
    const { svc, tenantUpdates } = sa();
    await svc.updateInstitutionStatus('s1', 'active', 'paid', 'admin');
    expect(tenantUpdates).toEqual([{ f: { slug: 's1', status: 'suspended' }, u: { $set: { status: 'active' } } }]);
  });
  it.each(['trial', 'churned', 'onboarding'])('%s does not touch the Tenant', async (st) => {
    const { svc, tenantUpdates } = sa();
    await svc.updateInstitutionStatus('s1', st, 'x', 'admin');
    expect(tenantUpdates).toHaveLength(0);
  });
});

describe('platform staff deactivation records who/when', () => {
  function ps() {
    const svc: any = Object.create(PlatformStaffService.prototype);
    let upd: any;
    svc.userModel = { findOneAndUpdate: jest.fn((_f: any, u: any) => { upd = u; return { select: () => Promise.resolve({ _id: 'x' }) }; }) };
    svc.authState = { invalidate: jest.fn() };
    return { svc, get: () => upd };
  }
  it('deactivate sets markers; reactivate clears them', async () => {
    const a = ps(); await a.svc.setStaffActive('x', false, 'actor');
    expect(a.get().$set).toMatchObject({ isActive: false, deactivatedBy: 'actor', deactivationReason: 'platform_staff_deactivated' });
    const b = ps(); await b.svc.setStaffActive('x', true, 'actor');
    expect(a.get().$inc).toEqual({ tokenVersion: 1 }); expect(b.get().$inc).toEqual({ tokenVersion: 1 });
    expect(b.get().$set).toEqual({ isActive: true }); expect(Object.keys(b.get().$unset)).toEqual(['deactivatedAt', 'deactivatedBy', 'deactivationReason']);
  });
});
