import { UnauthorizedException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { Types } from 'mongoose';
import { AuthService } from './auth.service';
import { ParentAuthService } from '../../parent-portal/parent-auth.service';

const GOOD = bcrypt.hashSync('Correct#1', 4);

function auth(users: any[]) {
  const svc: any = Object.create(AuthService.prototype);
  const q = (f: any) => users.find(u => (!f.email || u.email === f.email) && (f.isActive === undefined || u.isActive === f.isActive) && (!f.resetPasswordTokenHash || u.resetPasswordTokenHash === f.resetPasswordTokenHash)) || null;
  svc.userModel = {
    findOne: jest.fn((f: any) => { const r = q(f); return Object.assign(Promise.resolve(r), { lean: () => Promise.resolve(r) }); }),
    findByIdAndUpdate: jest.fn(),
  };
  svc.emailService = { sendEmail: jest.fn() };
  svc.authState = { invalidate: jest.fn() };
  return svc;
}
const active = { _id: 'u1', email: 'a@x.test', isActive: true, passwordHash: GOOD, primaryRole: 'teacher' };
const inactive = { ...active, _id: 'u2', email: 'gone@x.test', isActive: false };

describe('login of a deactivated user (S1)', () => {
  it('is rejected with the SAME generic error as a wrong password and an unknown e-mail', async () => {
    const svc = auth([active, inactive]);
    const msgs: string[] = [];
    for (const [email, pw] of [['a@x.test', 'wrong'], ['gone@x.test', 'Correct#1'], ['nobody@x.test', 'x']]) {
      try { await svc.login(email, pw); } catch (e: any) { expect(e).toBeInstanceOf(UnauthorizedException); msgs.push(e.message); }
    }
    expect(msgs).toEqual(['Invalid credentials', 'Invalid credentials', 'Invalid credentials']);
  });
  it('does bcrypt work for unknown/inactive accounts too (no timing oracle)', async () => {
    const spy = jest.spyOn(require('bcryptjs'), 'compare');
    const svc = auth([inactive]);
    await expect(svc.login('gone@x.test', 'Correct#1')).rejects.toThrow('Invalid credentials');
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe('password reset for a deactivated user', () => {
  it('forgot-password answers generically and sends nothing (query requires isActive:true)', async () => {
    const svc = auth([inactive]);
    await expect(svc.forgotPassword('gone@x.test')).resolves.toEqual({ message: 'If an account exists with that email, a reset link has been sent.' });
    expect(svc.emailService.sendEmail).not.toHaveBeenCalled();
    expect(svc.userModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });
  it('a reset token issued BEFORE deactivation is refused with the generic invalid/expired error', async () => {
    const hash = crypto.createHash('sha256').update('tok').digest('hex');
    const u = { ...inactive, resetPasswordTokenHash: hash, resetPasswordExpires: new Date(Date.now() + 1e6) };
    const svc = auth([u]);
    svc.userModel.findOne = jest.fn(() => Promise.resolve(u));
    await expect(svc.resetPassword('tok', 'NewPass#1')).rejects.toThrow('This reset link is invalid or has expired');
    expect(svc.userModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });
  it('an active user can still reset', async () => {
    const hash = crypto.createHash('sha256').update('tok').digest('hex');
    const u = { ...active, resetPasswordTokenHash: hash, resetPasswordExpires: new Date(Date.now() + 1e6) };
    const svc = auth([u]); svc.userModel.findOne = jest.fn(() => Promise.resolve(u));
    await expect(svc.resetPassword('tok', 'NewPass#1')).resolves.toMatchObject({ message: expect.stringContaining('Password updated') });
  });
});

describe('login scope ignores a removed Staff row', () => {
  it('queries Staff with isActive != false (this strips staff scope from a demoted account)', async () => {
    const svc: any = Object.create(AuthService.prototype);
    let filter: any;
    svc.staffModel = { findOne: jest.fn((f: any) => { filter = f; return { select: () => ({ lean: () => Promise.resolve(null) }) }; }) };
    svc.campusModel = { find: () => ({ select: () => ({ limit: () => ({ lean: () => Promise.resolve([]) }) }) }) };
    await svc.resolveScopeFieldsForUser('507f1f77bcf86cd799439011', 'sch');
    expect(filter.isActive).toEqual({ $ne: false });
  });
});

describe('parent OTP for a deactivated user', () => {
  const NOT_FOUND = /No student record found with this WhatsApp number/;
  function parent(user: any) {
    const svc: any = Object.create(ParentAuthService.prototype);
    svc.userModel = { findOne: jest.fn(() => Promise.resolve(user)) };
    svc.studentModel = { find: () => ({ lean: () => Promise.resolve([{ _id: new Types.ObjectId(), schoolSlug: 's', guardians: [{ phone: '0300' }] }]) }), findOne: () => ({ select: () => ({ lean: () => Promise.resolve({ schoolSlug: 's' }) }) }) };
    svc.tenantModel = { findOne: () => ({ lean: () => Promise.resolve({ _id: 't', slug: 's' }) }), findById: () => ({ lean: () => Promise.resolve({ slug: 's' }) }) };
    svc.jwtService = { sign: jest.fn(() => 'tok') };
    return svc;
  }
  it('request-OTP resolution answers like an unknown number', async () => {
    await expect(parent({ isActive: false, phone: '1' }).resolveSchoolForPhone('1')).rejects.toThrow(NotFoundException);
    await expect(parent({ isActive: false, phone: '1' }).resolveSchoolForPhone('1')).rejects.toThrow(NOT_FOUND);
  });
  it('verify path issues NO session and does not create a second account', async () => {
    const svc = parent({ isActive: false, phone: '1', save: jest.fn() });
    svc.userModel.create = jest.fn();
    await expect(svc.issueSessionForPhone('0300')).rejects.toThrow(NOT_FOUND);
    expect(svc.jwtService.sign).not.toHaveBeenCalled(); expect(svc.userModel.create).not.toHaveBeenCalled();
  });
  it('an active parent still gets a session', async () => {
    const svc = parent({ _id: 'p1', isActive: true, phone: '0300', profile: {}, guardianOfStudentIds: [], save: jest.fn() });
    await expect(svc.issueSessionForPhone('0300')).resolves.toMatchObject({ accessToken: 'tok' });
  });
});

import { ForbiddenException } from '@nestjs/common';
import { SCHOOL_SUSPENDED_MESSAGE } from '../../common/constants/school-suspended';

describe('suspended school (pending owner confirmation): clear message, only for the school case', () => {
  const MSG = "This school's account is suspended — please contact your school";
  it('the message is exactly as specified (em dash)', () => expect(SCHOOL_SUSPENDED_MESSAGE).toBe(MSG));

  function authWith(user: any, tenant: any) {
    const svc: any = Object.create(AuthService.prototype);
    svc.userModel = { findOne: jest.fn((f: any) => { const r = f.isActive === true && user.isActive === false ? null : user; return Object.assign(Promise.resolve(r), { lean: () => Promise.resolve(r), select: () => ({ lean: () => Promise.resolve(r) }) }); }), findByIdAndUpdate: jest.fn() };
    svc.tenantModel = { findById: () => ({ lean: () => Promise.resolve(tenant) }), findOne: () => ({ select: () => ({ lean: () => Promise.resolve(tenant) }) }) };
    svc.rolesService = { getPermissionsForUser: async () => null };
    svc.resolveScopeFieldsForUser = async () => ({});
    svc.jwtService = { sign: () => 't' };
    return svc;
  }
  const u = { _id: 'u1', email: 'a@x.test', isActive: true, passwordHash: GOOD, primaryRole: 'teacher', tenantId: 't1' };

  it('login: valid credentials at a suspended school -> 403 with the clear message', async () => {
    await expect(authWith(u, { _id: 't1', slug: 's', status: 'suspended' }).login('a@x.test', 'Correct#1')).rejects.toThrow(MSG);
  });
  it('login: WRONG password at a suspended school is still the generic 401 (no status leak)', async () => {
    await expect(authWith(u, { _id: 't1', slug: 's', status: 'suspended' }).login('a@x.test', 'wrong')).rejects.toThrow('Invalid credentials');
  });
  it('login: inactive user at a suspended school stays generic', async () => {
    await expect(authWith({ ...u, isActive: false }, { _id: 't1', slug: 's', status: 'suspended' }).login('a@x.test', 'Correct#1')).rejects.toThrow('Invalid credentials');
  });
  it('token+slug login (/auth/me): suspended school -> 403 clear message; active school works', async () => {
    const mk = (status: string) => { const s = authWith(u, { status }); s.userModel.findOne = () => ({ select: () => ({ lean: () => Promise.resolve({ ...u }) }) }); return s; };
    await expect(mk('suspended').getMe('u1', '507f1f77bcf86cd799439011')).rejects.toThrow(MSG);
    await expect(mk('active').getMe('u1', '507f1f77bcf86cd799439011')).resolves.toMatchObject({ _id: 'u1' });
  });

  describe('parent OTP request and verify', () => {
    function parent(status: string) {
      const svc: any = Object.create(ParentAuthService.prototype);
      svc.userModel = { findOne: jest.fn(() => Promise.resolve(null)) };
      svc.studentModel = { find: () => ({ lean: () => Promise.resolve([{ _id: new Types.ObjectId(), schoolSlug: 's', guardians: [{ phone: '0300' }] }]) }), findOne: () => ({ select: () => ({ lean: () => Promise.resolve({ schoolSlug: 's' }) }) }) };
      svc.tenantModel = { findOne: () => Object.assign({ lean: () => Promise.resolve({ _id: 't', slug: 's', status }) }, { select: () => ({ lean: () => Promise.resolve({ status }) }) }) };
      svc.otpModel = { findOne: () => ({ sort: () => ({ lean: () => Promise.resolve(null) }) }), create: jest.fn() };
      svc.whatsAppService = { sendTemplateMessage: jest.fn(async () => ({ sent: true })) };
      svc.jwtService = { sign: jest.fn(() => 'tok') };
      return svc;
    }
    it('request-OTP: suspended school -> 403 clear message, NO OTP created or sent', async () => {
      const s = parent('suspended');
      await expect(s.requestOtp('+923001234567')).rejects.toThrow(MSG);
      expect(s.otpModel.create).not.toHaveBeenCalled(); expect(s.whatsAppService.sendTemplateMessage).not.toHaveBeenCalled();
    });
    it('verify path: suspended school -> 403, no session', async () => {
      const s = parent('suspended');
      await expect(s.issueSessionForPhone('0300')).rejects.toThrow(ForbiddenException);
      expect(s.jwtService.sign).not.toHaveBeenCalled();
    });
    it('active school still works', async () => {
      const s = parent('active');
      s.userModel.create = jest.fn(async (d: any) => ({ _id: 'p1', profile: {}, guardianOfStudentIds: [], ...d }));
      await expect(s.issueSessionForPhone('0300')).resolves.toMatchObject({ accessToken: 'tok' });
    });
  });
});
