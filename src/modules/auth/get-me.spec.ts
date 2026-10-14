import { AuthService } from './auth.service';

describe('GET /auth/me secrets', () => {
  it('excludes passwordHash, resetPasswordTokenHash and resetPasswordExpires from the query', async () => {
    let selected = '';
    const stored = { _id: 'u1', email: 'a@b.c', primaryRole: 'teacher', profile: { firstName: 'A' }, phone: '1', customRoleId: null, guardianOfStudentIds: [], linkedStudentId: null };
    const svc: any = Object.create(AuthService.prototype);
    svc.userModel = { findOne: () => ({ select: (f: string) => { selected = f; return { lean: () => Promise.resolve({ ...stored }) }; } }) };
    svc.tenantModel = { findOne: () => ({ select: () => ({ lean: () => Promise.resolve({ status: 'active' }) }) }) };
    svc.rolesService = { getPermissionsForUser: () => Promise.resolve(null) };
    svc.resolveScopeFieldsForUser = () => Promise.resolve({});
    const me = await svc.getMe('u1', 't1');
    expect(selected.split(' ')).toEqual(expect.arrayContaining(['-passwordHash', '-resetPasswordTokenHash', '-resetPasswordExpires']));
    // fields the web / parent app / teacher app actually read are untouched
    expect(me).toMatchObject({ _id: 'u1', email: 'a@b.c', primaryRole: 'teacher', profile: { firstName: 'A' } });
  });
});
