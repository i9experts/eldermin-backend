// LIVE-SAFE pre-demo API smoke: GET-only + auth checks. No writes, no deletes.
// Run: npx jest test/e2e/smoke.api.e2e-spec.ts --config ./test/jest-e2e.json --runInBand
import request from 'supertest';
import { API, DEMO, login, asList } from './helpers';

jest.setTimeout(30_000);

let token: string;
beforeAll(async () => {
  token = await login();
});

const auth = (r: request.Test) =>
  r.set('Authorization', `Bearer ${token}`).set('x-school-slug', DEMO.slug);

describe('auth', () => {
  it('login returns a token for the demo admin', () => {
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(20);
  });
});

describe('tenancy: /hr/staff', () => {
  it('rejects requests with no token', async () => {
    await request(API).get('/hr/staff').expect(401);
  });

  it('returns only own-tenant data with valid token + slug', async () => {
    const res = await auth(request(API).get('/hr/staff')).expect(200);
    for (const s of asList(res.body)) {
      expect(s.tenantId ?? s.schoolSlug ?? s.school).toBe(DEMO.slug);
    }
  });

  it('does NOT leak another tenant via spoofed x-school-slug', async () => {
    const res = await request(API)
      .get('/hr/staff')
      .set('Authorization', `Bearer ${token}`)
      .set('x-school-slug', 'other-school');
    if (res.status === 200) {
      for (const s of asList(res.body)) {
        expect(s.tenantId ?? s.schoolSlug ?? s.school).not.toBe('other-school');
      }
    } else {
      expect([401, 403]).toContain(res.status);
    }
  });
});

const endpoints: Array<{ module: string; path: string; slow?: boolean }> = [
  { module: 'Organization', path: '/organization/overview' },
  { module: 'Documents & Workflow', path: '/documents' },
  { module: 'Staff & HR (StaffSelect)', path: '/hr/staff?limit=200&status=active' },
  { module: 'Teaching Management', path: '/teaching/dashboard' },
  { module: 'Finance', path: '/finance/invoices' },
  { module: 'Procurement', path: '/procurement/orders' },
  { module: 'Campus Operations', path: '/campus/dashboard' },
  { module: 'Students 360', path: '/students' },
  { module: 'Curriculum', path: '/academics/curriculum' },
  { module: 'Syllabus', path: '/academics/syllabus' },
  { module: 'Timetable (lives under Teaching)', path: '/teaching/timetable' },
  { module: 'Library', path: '/academics/library/books' },
  { module: 'Assessment', path: '/assessments' },
  { module: 'Behaviour & Tarbiyah', path: '/behaviour/records' },
];

describe('GET smoke per module (read-only)', () => {
  for (const e of endpoints) {
    it(
      `${e.module}: GET ${e.path} responds 200`,
      async () => {
        const res = await auth(request(API).get(e.path));
        expect(res.status).toBe(200);
        for (const item of asList(res.body)) {
          const slug = item.schoolSlug ?? item.school;
          if (slug !== undefined) expect(slug).toBe(DEMO.slug);
        }
      },
      e.slow ? 60_000 : 30_000,
    );
  }
});

// KNOWN GAP: Analytics & Intelligence has no backend controller registered in app.module.ts.
// It is activatable in the module marketplace but has zero working API behind it.
// This test documents the gap — if it ever starts returning 200, the marketplace claim becomes true and this test should be updated.
describe('KNOWN GAP: Analytics & Intelligence', () => {
  it('has no backend route (expected 404 until implemented)', async () => {
    const res = await auth(request(API).get('/analytics/overview'));
    expect(res.status).toBe(404);
  });
});
