import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SyllabusService } from './syllabus.service';

// D12: a teacher (or any non-admin) can no longer approve a syllabus through create or the raw-$set PUT.
const ME = { staffId: 'S1', teacherProfileId: 'P1', userId: 'U1', name: 'T' };
function build(existing: any = { _id: 'x', teacherId: 'S1', status: 'draft', units: [] }) {
  const saved: any[] = []; const updates: any[] = [];
  function Model(this: any, payload: any) { this.payload = payload; this.save = async () => { saved.push(payload); return payload; }; }
  (Model as any).findOne = jest.fn(async () => existing);
  (Model as any).findOneAndUpdate = jest.fn(async (f: any, u: any) => { updates.push(u); return { ...existing, ...u.$set }; });
  const svc: any = Object.create(SyllabusService.prototype);
  svc.syllabusModel = Model;
  svc.teacherIdentity = async () => ME;
  return { svc: svc as SyllabusService, saved, updates };
}
const asRole = (role: string) => ({ role, userId: 'U1', tenantId: 't', campusId: undefined } as any);

describe('syllabus approval cannot be self-granted (D12)', () => {
  it('PUT: teacher setting status approved on their own syllabus -> 403, nothing written', async () => {
    const { svc, updates } = build();
    await expect(svc.update('t', 'x', { status: 'approved' } as any, asRole('teacher'))).rejects.toBeInstanceOf(ForbiddenException);
    expect(updates).toHaveLength(0);
  });
  it('POST: teacher creating an already-approved syllabus -> 403, nothing saved', async () => {
    const { svc, saved } = build();
    await expect(svc.create('t', 'i', 'U1', 'T', { status: 'approved', units: [] } as any, asRole('teacher'))).rejects.toBeInstanceOf(ForbiddenException);
    expect(saved).toHaveLength(0);
  });
  it('a custom-role user with a non-admin base role is treated the same', async () => {
    const { svc } = build();
    await expect(svc.update('t', 'x', { status: 'approved' } as any, asRole('support_staff'))).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('teacher still saves draft / active / archived and edits other fields', async () => {
    for (const status of ['draft', 'active', 'archived', undefined]) {
      const { svc, updates } = build();
      await svc.update('t', 'x', { status, description: 'd' } as any, asRole('teacher'));
      expect(updates[0].$set.description).toBe('d');
    }
    const { svc, saved } = build();
    await svc.create('t', 'i', 'U1', 'T', { status: 'active', units: [] } as any, asRole('teacher'));
    expect(saved[0].status).toBe('active');
  });
  it('approver-owned fields are stripped from a non-admin write', async () => {
    const { svc, updates } = build();
    await svc.update('t', 'x', { description: 'd', approvedBy: 'me', approvedAt: new Date() } as any, asRole('teacher'));
    expect(updates[0].$set.approvedBy).toBeUndefined(); expect(updates[0].$set.approvedAt).toBeUndefined();
  });
  it.each(['principal', 'admin', 'vice_principal', 'academic_coordinator', 'institution_owner', 'super_admin'])('%s can still set approved through PUT and create (today\'s behaviour)', async (role) => {
    const a = build();
    await a.svc.update('t', 'x', { status: 'approved' } as any, asRole(role));
    expect(a.updates[0].$set.status).toBe('approved');
    const b = build();
    await b.svc.create('t', 'i', 'U1', 'T', { status: 'approved', units: [] } as any, asRole(role));
    expect(b.saved[0].status).toBe('approved');
  });
  it('a teacher still cannot touch another teacher\'s syllabus (#160 ownership unchanged)', async () => {
    const { svc } = build({ _id: 'x', teacherId: 'S2', status: 'draft', units: [] });
    await expect(svc.update('t', 'x', { description: 'd' } as any, asRole('teacher'))).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('missing syllabus -> 404', async () => {
    const { svc } = build(null);
    await expect(svc.update('t', 'x', {} as any, asRole('teacher'))).rejects.toBeInstanceOf(NotFoundException);
  });
});
