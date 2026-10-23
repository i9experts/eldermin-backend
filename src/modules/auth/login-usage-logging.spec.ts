import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { ParentAuthService } from '../../parent-portal/parent-auth.service';

const GOOD = bcrypt.hashSync('Correct#1', 4);

describe('AuthService.login records a usage event for the school that logged in', () => {
  function build() {
    const svc: any = Object.create(AuthService.prototype);
    const user = {
      _id: 'u1', email: 'a@x.test', isActive: true, passwordHash: GOOD,
      primaryRole: 'teacher', schoolSlug: 'deenway-school', tokenVersion: 0,
    };
    svc.userModel = {
      findOne: () => ({ lean: () => Promise.resolve(user) }),
      findByIdAndUpdate: jest.fn(),
    };
    svc.tenantModel = {
      findOne: () => ({ lean: () => Promise.resolve({ _id: 't1', slug: 'deenway-school', activeModules: ['organization'] }) }),
    };
    svc.usageLogModel = { findOneAndUpdate: jest.fn(() => Promise.resolve({})) };
    svc.rolesService = { getPermissionsForUser: () => Promise.resolve(null) };
    svc.resolveScopeFieldsForUser = () => Promise.resolve({});
    svc.jwtService = { sign: jest.fn(() => 'signed.jwt.token') };
    return svc;
  }

  it('upserts a dailyLogins increment keyed by the logged-in user\'s schoolSlug', async () => {
    const svc = build();
    await svc.login('a@x.test', 'Correct#1');
    expect(svc.usageLogModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [filter] = svc.usageLogModel.findOneAndUpdate.mock.calls[0];
    expect(filter.institutionSlug).toBe('deenway-school');
  });

  it('a usage-log failure never prevents login from succeeding', async () => {
    const svc = build();
    svc.usageLogModel.findOneAndUpdate = jest.fn(() => Promise.reject(new Error('mongo down')));
    const result = await svc.login('a@x.test', 'Correct#1');
    expect(result.accessToken).toBe('signed.jwt.token');
  });
});

describe('ParentAuthService OTP login records a usage event', () => {
  function build() {
    const svc: any = Object.create(ParentAuthService.prototype);
    svc.studentModel = {
      find: () => ({ lean: () => Promise.resolve([{ _id: '507f1f77bcf86cd799439011', schoolSlug: 'deenway-school', guardians: [{ phone: '0300', name: 'Parent' }] }]) }),
    };
    svc.tenantModel = { findOne: () => ({ lean: () => Promise.resolve({ _id: 't1', slug: 'deenway-school', activeModules: ['organization'] }) }) };
    svc.userModel = {
      findOne: jest.fn(() => Promise.resolve({
        _id: 'u1', phone: '0300', isActive: true, guardianOfStudentIds: [],
        profile: {}, save: jest.fn(), tokenVersion: 0,
      })),
    };
    svc.usageLogModel = { findOneAndUpdate: jest.fn(() => Promise.resolve({})) };
    svc.jwtService = { sign: jest.fn(() => 'signed.jwt.token') };
    return svc;
  }

  it('upserts a dailyLogins increment keyed by the student\'s schoolSlug', async () => {
    const svc = build();
    await svc.issueSessionForPhone('0300');
    expect(svc.usageLogModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [filter] = svc.usageLogModel.findOneAndUpdate.mock.calls[0];
    expect(filter.institutionSlug).toBe('deenway-school');
  });
});
