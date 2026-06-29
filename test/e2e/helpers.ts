// /root/eldermin-backend/test/e2e/helpers.ts
// Setup: npm i -D supertest @types/supertest
import request from 'supertest';

export const API = process.env.API_URL || 'http://localhost:3001';
export const DEMO = {
  email: 'admin@demo-school.com',
  password: 'Admin@1234',
  slug: 'demo-school',
};

export async function login(
  email = DEMO.email,
  password = DEMO.password,
): Promise<string> {
  const res = await request(API).post('/auth/login').send({ email, password });
  if (![200, 201].includes(res.status)) {
    throw new Error(`Login failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return (res.body.access_token ?? res.body.token) as string;
}

export function authed(token: string, slug: string = DEMO.slug) {
  return (req: request.Test) =>
    req.set('Authorization', `Bearer ${token}`).set('x-school-slug', slug);
}

export function asList(body: any): any[] {
  return Array.isArray(body) ? body : body?.data ?? [];
}
