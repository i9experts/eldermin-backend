// /root/eldermin-backend/test/e2e/smoke.api.spec.ts
// LIVE-SAFE pre-demo API smoke: GET-only + auth checks. No writes, no deletes.
// Run locally:  npx jest test/e2e/smoke.api.spec.ts --runInBand
// Run vs VPS:   API_URL=http://93.127.163.238:3001 npx jest test/e2e/smoke.api.spec.ts --runInBand
//
// Adjust any endpoint path below to match your actual controllers.
// Gov & Compliance is intentionally ABSENT — it has no backend.
import request from 'supertest';
import { API, DEMO, login, asList } from './helpers';

jest.setTimeout(30_000);

let token: string;
beforeAll(async () => {
  token = await login();
});

const auth = (r: request.Test) =>
  r.set('Authorization', `Bearer ${token}`).set('x-school-slug', DEMO.slug);

// ---------- 1. Auth happy path ----------
describe('auth', () => {
  it('login returns a token for the demo admin', () => {
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(20);
  });
});

// ---------- 2. The three mandatory tenancy tests ----------
describe('tenancy: /hr/staff', () => {
  it('rejects requests with no token', async () => {
    await request(API).get('/hr/staff').expect(401);
  });

  it('returns only own-tenant data with valid token + slug', async () => {
    const res = await auth(request(API).get('/hr/staff')).expect(200);
    for (const s of asList(res.body)) {
      expect(s.schoolSlug ?? s.school).toBe(DEMO.slug);
    }
  });

  it('does NOT leak another tenant via spoofed x-school-slug', async () => {
    const res = await request(API)
      .get('/hr/staff')
      .set('Authorization', `Bearer ${token}`)
      .set('x-school-slug', 'other-school');
    if (res.status === 200) {
      for (const s of asList(res.body)) {
        expect(s.schoolSlug ?? s.school).not.toBe('other-school');
      }
    } else {
      expect([401, 403]).toContain(res.status);
    }
  });
});

// ---------- 3. GET smoke: one read endpoint per backend module ----------
const endpoints: Array<{ module: string; path: string; slow?: boolean }> = [
  { module: 'Organization',        path: '/organization' },
  { module: 'Documents & Workflow', path: '/documents' },
  { module: 'Staff & HR (StaffSelect)', path: '/hr/staff?limit=200&status=active' },
  { module: 'Teaching Management', path: '/teaching/classes' },
  { module: 'Finance',             path: '/finance/invoices' },
  { module: 'Procurement',         path: '/procurement/purchase-orders' },
  { module: 'Campus Operations',   path: '/campus-operations' },
  { module: 'Students 360',        path: '/students' },
  { module: 'Curriculum',          path: '/academics/curriculum' },
  { module: 'Syllabus',            path: '/academics/syllabus' },
  { module: 'Timetable',           path: '/academics/timetable' },
  { module: 'Library',             path: '/academics/library/books' },
  { module: 'Assessment',          path: '/assessments' },
  { module: 'Behaviour & Tarbiyah', path: '/behaviour/observations' },
  { module: 'Analytics & Intelligence', path: '/analytics/overview', slow: true },
];

describe('GET smoke per module (read-only)', () => {
  for (const e of endpoints) {
    it(
      `${e.module}: GET ${e.path} responds 200`,
      async () => {
        const res = await auth(request(API).get(e.path));
        expect(res.status).toBe(200);
        // Every returned record (if any) must belong to demo-school.
        for (const item of asList(res.body)) {
          const slug = item.schoolSlug ?? item.school;
          if (slug !== undefined) expect(slug).toBe(DEMO.slug);
        }
      },
      e.slow ? 60_000 : 30_000, // AI insight endpoints can be slow
    );
  }
});
