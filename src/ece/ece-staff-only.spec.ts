import { CanActivate, ExecutionContext, INestApplication, Injectable, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { EceController } from './ece.controller';
import { EceService } from './ece.service';
import { RolesGuard } from '../auth/roles.guard';
import { StaffOnlyGuard } from '../auth/staff-only.guard';
import { RolesOrModuleManageGuard } from '../roles/guards/roles-or-module-manage.guard';
import { Role } from '../roles/schemas/role.schema';
import { User } from '../modules/organization/schemas/user.schema';

// No DB, no network: EceService is a stub and the auth pipeline is rebuilt from
// the real RolesGuard / RolesOrModuleManageGuard, with a stand-in for JwtAuthGuard
// that reads the decoded token from a header (JwtStrategy itself is not under test).
@Injectable()
class HeaderAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    const raw = ctx.switchToHttp().getRequest().headers['x-test-user'];
    if (raw) ctx.switchToHttp().getRequest().user = JSON.parse(String(raw));
    return true;
  }
}

const base = { userId: 'u1', tenantId: 't1', schoolSlug: 'demo-school', name: 'Token User' };
const tok = (role: string | undefined, extra: any = {}) => JSON.stringify({ ...base, ...(role ? { role } : {}), ...extra });
const parent = tok('parent', { guardianOfStudentIds: ['s1'] });
const student = tok('student');
const teacher = tok('teacher');
const admin = tok('admin');

describe('EceController is staff-only', () => {
  let app: INestApplication;
  const service: any = new Proxy({}, {
    // 'then' and symbols must stay undefined or Nest treats the stub as a thenable and hangs.
    get: (t: any, k: any) => (typeof k !== 'string' || k === 'then' ? undefined : (t[k] ||= jest.fn().mockResolvedValue({ ok: true }))),
    ownKeys: (t: any) => Reflect.ownKeys(t),
  });

  beforeAll(async () => {
    const noCustomRole = { findById: () => ({ select: () => ({ lean: () => Promise.resolve(null) }) }) };
    const mod = await Test.createTestingModule({
      controllers: [EceController],
      providers: [
        { provide: EceService, useValue: service },
        { provide: getModelToken(Role.name), useValue: noCustomRole },
        { provide: getModelToken(User.name), useValue: noCustomRole },
        { provide: APP_GUARD, useClass: HeaderAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: RolesOrModuleManageGuard },
      ],
    }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: false }));
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => Object.values(service).forEach((f: any) => f.mockClear?.()));

  const as = (who: string | undefined) => (r: request.Test) => (who ? r.set('x-test-user', who) : r);

  const reads: Array<[string, string]> = [
    ['children', '/ece/children'],
    ['allergies', '/ece/students/507f1f77bcf86cd799439011/allergies'],
    ['support-cases', '/ece/support-cases'],
  ];
  const writes: Array<[string, string, string, any]> = [
    ['care-records', 'post', '/ece/care-records', { studentId: '507f1f77bcf86cd799439011', date: '2026-10-26', type: 'meal' }],
    ['profile tags', 'patch', '/ece/students/507f1f77bcf86cd799439011/profile/tags', { interests: ['blocks'] }],
    ['seed', 'post', '/ece/domains/seed-default', null],
    ['ai check-quality', 'post', '/ece/ai/check-quality', { narrative: 'x' }],
  ];

  describe.each([['parent', parent], ['student', student]])('%s token', (_n, who) => {
    it.each(reads)('403 on read: %s', async (_l, path) => {
      await as(who)(request(app.getHttpServer()).get(path)).expect(403);
    });
    it.each(writes)('403 on write: %s', async (_l, method, path, body) => {
      await as(who)((request(app.getHttpServer()) as any)[method](path).send(body ?? {})).expect(403);
    });
    it('never reaches the service', async () => {
      await as(who)(request(app.getHttpServer()).get('/ece/children')).expect(403);
      expect(service.getChildren).not.toHaveBeenCalled();
    });
  });

  it.each([
    ['parent_lead', tok('parent_lead')],
    ['reseller_admin', tok('reseller_admin')],
    ['no role + guardianOfStudentIds', tok(undefined, { guardianOfStudentIds: ['s1'] })],
    ['unknown role', tok('mystery')],
    ['no token', undefined],
  ])('403 for %s', async (_n, who) => {
    await as(who)(request(app.getHttpServer()).get('/ece/children')).expect(403);
  });

  describe.each([['teacher', teacher], ['admin', admin]])('%s token (unchanged)', (_n, who) => {
    it.each(reads)('200 on read: %s', async (_l, path) => {
      await as(who)(request(app.getHttpServer()).get(path)).expect(200);
    });
    it('200 on unguarded writes and the seed route', async () => {
      await as(who)(request(app.getHttpServer()).patch('/ece/students/507f1f77bcf86cd799439011/profile/tags').send({ interests: ['blocks'] })).expect(200);
      await as(who)(request(app.getHttpServer()).post('/ece/domains/seed-default')).expect(200);
    });
  });

  it('a staff role that also carries guardianOfStudentIds is still allowed', async () => {
    await as(tok('teacher', { guardianOfStudentIds: ['s9'] }))(request(app.getHttpServer()).get('/ece/children')).expect(200);
  });

  describe('actor comes from the token, not the body', () => {
    it('portfolio respond stores the token user', async () => {
      await as(teacher)(request(app.getHttpServer()).patch('/ece/portfolio/p1/respond').send({ text: 'Thanks', respondedBy: 'Someone Else' })).expect(200);
      expect(service.respondToEntry).toHaveBeenCalledWith('demo-school', 'p1', 'Thanks', 'Token User');
    });
    it('portfolio respond still validates without respondedBy (optional)', async () => {
      await as(teacher)(request(app.getHttpServer()).patch('/ece/portfolio/p1/respond').send({ text: 'Thanks' })).expect(200);
      expect(service.respondToEntry).toHaveBeenCalledWith('demo-school', 'p1', 'Thanks', 'Token User');
    });
    it('safety check stores the token user', async () => {
      await as(teacher)(request(app.getHttpServer()).patch('/ece/environment-areas/a1/safety-check').send({ checkedBy: 'Someone Else' })).expect(200);
      expect(service.logSafetyCheck).toHaveBeenCalledWith('demo-school', 'a1', 'Token User');
    });
    it('safety check works with an empty body (checkedBy optional)', async () => {
      await as(teacher)(request(app.getHttpServer()).patch('/ece/environment-areas/a1/safety-check').send({})).expect(200);
      expect(service.logSafetyCheck).toHaveBeenCalledWith('demo-school', 'a1', 'Token User');
    });
  });
});
