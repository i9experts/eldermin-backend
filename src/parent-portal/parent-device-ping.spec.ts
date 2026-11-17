import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ParentPortalService, MAX_DEVICES_PER_PARENT } from './parent-portal.service';
import { ParentPortalController } from './parent-portal.controller';
import { ParentEarlyYearsController } from './parent-early-years.controller';
import { ROLES_KEY, ALLOW_NON_STAFF_KEY } from '../auth/decorators';
import { UserRole } from '../auth/roles.enum';

const UID = new Types.ObjectId().toHexString(), TID = new Types.ObjectId().toHexString();
function svc(existingDevices = 0, alreadyThere = false) {
  const upserts: any[] = [];
  const s: any = Object.create(ParentPortalService.prototype);
  s.deviceModel = {
    exists: jest.fn(async () => (alreadyThere ? { _id: 1 } : null)),
    countDocuments: jest.fn(async () => existingDevices),
    findOneAndUpdate: jest.fn(async (f: any, u: any, o: any) => { upserts.push({ f, u, o }); return {}; }),
  };
  return { s: s as ParentPortalService, upserts, model: s.deviceModel };
}
const ping = (extra: any = {}) => ({ deviceId: 'abcd1234-device', platform: 'ios', appVersion: '1.0.8', ...extra });

describe('device-ping (parent app 1.0.8): input is bounded and scoped to the signed-in parent', () => {
  it('stores one row per (this parent, device) with the school from the TOKEN; the body only supplies id, platform and version', async () => {
    const { s, upserts } = svc();
    expect(await s.recordDevicePing(UID, TID, ping())).toEqual({ ok: true });
    expect(String(upserts[0].f.userId)).toBe(UID);
    expect(upserts[0].f.deviceId).toBe('abcd1234-device');
    expect(String(upserts[0].u.$set.tenantId)).toBe(TID);
    expect(upserts[0].o).toMatchObject({ upsert: true });
  });
  it.each([[{ deviceId: undefined }], [{ deviceId: '' }], [{ deviceId: 'short' }], [{ deviceId: 'x'.repeat(129) }], [{ deviceId: 'has space in it' }], [{ deviceId: '<script>alert(1)</script>' }], [{ deviceId: { $ne: 1 } }], [{ platform: 'windows' }], [{ platform: undefined }]])
  ('rejects a bad body %j with 400 and writes nothing', async (bad: any) => {
    const { s, upserts } = svc();
    await expect(s.recordDevicePing(UID, TID, ping(bad))).rejects.toBeInstanceOf(BadRequestException);
    expect(upserts).toHaveLength(0);
  });
  it('an account context that is not an ObjectId (slug-fallback tokens) is a 400, not a 500', async () => {
    const { s } = svc();
    await expect(s.recordDevicePing('u', TID, ping())).rejects.toBeInstanceOf(BadRequestException);
    await expect(s.recordDevicePing(UID, 'demo-school', ping())).rejects.toBeInstanceOf(BadRequestException);
  });
  it('appVersion is trimmed to 32 characters and ignored when not a string', async () => {
    const a = svc(); await a.s.recordDevicePing(UID, TID, ping({ appVersion: '9'.repeat(100) }));
    expect(a.upserts[0].u.$set.appVersion).toHaveLength(32);
    const b = svc(); await b.s.recordDevicePing(UID, TID, ping({ appVersion: { x: 1 } }));
    expect(b.upserts[0].u.$set.appVersion).toBeUndefined();
  });
  it(`a parent cannot grow the collection without bound: beyond ${MAX_DEVICES_PER_PARENT} devices a NEW id is acknowledged but not stored; a known device still refreshes`, async () => {
    const full = svc(MAX_DEVICES_PER_PARENT);
    expect(await full.s.recordDevicePing(UID, TID, ping())).toEqual({ ok: true });
    expect(full.upserts).toHaveLength(0);
    const known = svc(MAX_DEVICES_PER_PARENT, true);
    await known.s.recordDevicePing(UID, TID, ping());
    expect(known.upserts).toHaveLength(1);
  });
});

describe('who can reach the parent-app routes (class guards)', () => {
  it('device-ping inherits @Roles(PARENT): a staff, student or partner token is refused, and the handler has no own override', () => {
    expect(Reflect.getMetadata(ROLES_KEY, ParentPortalController)).toEqual([UserRole.PARENT]);
    expect(Reflect.getMetadata(ROLES_KEY, (ParentPortalController.prototype as any).pingDevice)).toBeUndefined();
  });
  it('Early Years: parent only (@Roles) AND opened to NonStaffGuard, so it keeps working the day NON_STAFF_GUARD_MODE=enforce', () => {
    expect(Reflect.getMetadata(ROLES_KEY, ParentEarlyYearsController)).toEqual([UserRole.PARENT]);
    expect(Reflect.getMetadata(ALLOW_NON_STAFF_KEY, ParentEarlyYearsController)).toBe(true);
  });
});
