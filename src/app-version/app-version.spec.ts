import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { compareSemver, isValidSemver } from './version.util';
import { AppVersionService } from './app-version.service';
import { AppVersionQueryDto, UpdateAppVersionDto } from './dto/app-version.dto';
import { APP_VERSIONS_SEED } from './app-version.seed';
import { AppVersionAdminController } from './app-version.controller';
import { ROLES_KEY } from '../auth/decorators';
import { UserRole } from '../auth/roles.enum';

const ID = '507f1f77bcf86cd799439011';
const lean = (v: any) => ({ lean: () => Promise.resolve(v) });

describe('semver util', () => {
  it('validates strictly x.y.z', () => {
    expect(isValidSemver('1.0.8')).toBe(true);
    for (const v of ['1.0', '1.0.8+3', 'v1.0.8', '1.0.8-beta', '', null]) expect(isValidSemver(v)).toBe(false);
  });
  it('compares numerically, not as strings', () => {
    expect(compareSemver('1.0.10', '1.0.9')).toBe(1);
    expect(compareSemver('1.9.0', '1.10.0')).toBe(-1);
    expect(compareSemver('2.0.0', '2.0.0')).toBe(0);
  });
});

describe('DTO validation', () => {
  it('rejects bad app/platform', async () => {
    expect((await validate(plainToInstance(AppVersionQueryDto, { app: 'x', platform: 'ios' }))).length).toBe(1);
    expect((await validate(plainToInstance(AppVersionQueryDto, { app: 'parent', platform: 'web' }))).length).toBe(1);
    expect((await validate(plainToInstance(AppVersionQueryDto, {}))).length).toBe(2);
    expect((await validate(plainToInstance(AppVersionQueryDto, { app: 'parent', platform: 'ios' }))).length).toBe(0);
  });
  it('rejects bad version / url on update', async () => {
    expect((await validate(plainToInstance(UpdateAppVersionDto, { latestVersion: '1.0' }))).length).toBe(1);
    expect((await validate(plainToInstance(UpdateAppVersionDto, { storeUrl: 'nope' }))).length).toBe(1);
    expect((await validate(plainToInstance(UpdateAppVersionDto, { latestVersion: '1.0.8', minVersion: '1.0.0', updateMessage: null }))).length).toBe(0);
  });
});

describe('AppVersionService', () => {
  const mk = (row: any) => {
    const model: any = {
      findOne: jest.fn(() => lean(row)),
      findById: jest.fn(() => lean(row)),
      findByIdAndUpdate: jest.fn((_id, u) => lean({ ...row, ...u.$set })),
    };
    return { model, svc: new AppVersionService(model) };
  };
  const row = { _id: ID, app: 'parent', platform: 'ios', latestVersion: '1.0.9', minVersion: '0.0.0', storeUrl: 'https://x', updateMessage: undefined };

  it('public: maps fields and null message; 404 when missing', async () => {
    expect(await mk(row).svc.getPublic('parent', 'ios')).toEqual({ latestVersion: '1.0.9', minVersion: '0.0.0', storeUrl: 'https://x', message: null });
    await expect(mk(null).svc.getPublic('parent', 'ios')).rejects.toBeInstanceOf(NotFoundException);
  });
  it('update: min > latest compared numerically is rejected (against stored value too)', async () => {
    await expect(mk(row).svc.update(ID, { minVersion: '1.0.10' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(mk(row).svc.update(ID, { latestVersion: '1.0.10', minVersion: '1.0.10' })).resolves.toBeTruthy();
    await expect(mk({ ...row, minVersion: '1.0.5' }).svc.update(ID, { latestVersion: '1.0.4' })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('update: empty body 400, bad id 400, unknown id 404, blank message -> null', async () => {
    await expect(mk(row).svc.update(ID, {})).rejects.toBeInstanceOf(BadRequestException);
    await expect(mk(row).svc.update('abc', { minVersion: '1.0.0' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(mk(null).svc.update(ID, { minVersion: '1.0.0' })).rejects.toBeInstanceOf(NotFoundException);
    const m = mk(row);
    const out = await m.svc.update(ID, { updateMessage: '  ' });
    expect(out.updateMessage).toBeNull();
  });
});

describe('seed + protection', () => {
  it('seeds 4 rows, min 0.0.0, valid semver, unique (app,platform)', () => {
    expect(APP_VERSIONS_SEED).toHaveLength(4);
    expect(new Set(APP_VERSIONS_SEED.map(r => r.app + r.platform)).size).toBe(4);
    for (const r of APP_VERSIONS_SEED) { expect(r.minVersion).toBe('0.0.0'); expect(isValidSemver(r.latestVersion)).toBe(true); }
  });
  it('admin controller is super_admin only', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AppVersionAdminController)).toEqual([UserRole.SUPER_ADMIN]);
  });
});
