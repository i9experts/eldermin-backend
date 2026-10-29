import 'reflect-metadata';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Types } from 'mongoose';
import { ComplaintsController } from './complaints.controller';
import { ComplaintsService } from './complaints.service';
import { RolesGuard } from '../auth/roles.guard';
import { ROLES_KEY, ALLOW_NON_STAFF_KEY } from '../auth/decorators';
import { UserRole } from '../auth/roles.enum';
import { SCHOOL_STAFF_ROLES } from '../auth/role-sets';

const proto: any = ComplaintsController.prototype;
const STAFF_HANDLERS = ['getCaseTypes', 'createCaseType', 'updateCaseType', 'getAging', 'getCases', 'getById', 'addRemark', 'reassign', 'close', 'reopen', 'runEscalationsNow'];
const reflector = new Reflector();
const guard = new RolesGuard(reflector);
const passes = (handler: string, role: string): boolean => {
  const ctx: any = { getHandler: () => proto[handler], getClass: () => ComplaintsController, switchToHttp: () => ({ getRequest: () => ({ user: { role, userId: 'u', schoolSlug: 's' } }) }) };
  try { return !!guard.canActivate(ctx); } catch (e) { if (e instanceof ForbiddenException) return false; throw e; }
};

describe('complaints guard (R2 item 6): staff actions are staff-only, hard', () => {
  it.each(STAFF_HANDLERS)('%s carries @Roles(SCHOOL_STAFF_ROLES) and is not opened to non-staff tokens', (h) => {
    expect([...Reflect.getMetadata(ROLES_KEY, proto[h])].sort()).toEqual([...SCHOOL_STAFF_ROLES].sort());
    expect(Reflect.getMetadata(ALLOW_NON_STAFF_KEY, proto[h])).toBeUndefined();
  });
  it.each(STAFF_HANDLERS)('%s: parent, student and reseller tokens get 403 (RolesGuard, independent of NON_STAFF_GUARD_MODE)', (h) => {
    for (const r of ['parent', 'student', 'reseller_admin', 'reseller_support']) expect(passes(h, r)).toBe(false);
  });
  it.each(STAFF_HANDLERS)('%s: every school staff role keeps access, as the web\'s Governance > Complaints tab needs (super_admin, institution_owner, admin, principal and custom roles)', (h) => {
    for (const r of ['super_admin', 'institution_owner', 'admin', 'principal', 'vice_principal', 'academic_coordinator', 'teacher', 'hr_manager']) expect(passes(h, r)).toBe(true);
  });
  it('the three parent routes: create (any token incl. parent) and read-own (parent/student only), all opened to NonStaffGuard', () => {
    for (const h of ['createCase', 'getMine', 'getMineById']) expect(Reflect.getMetadata(ALLOW_NON_STAFF_KEY, proto[h])).toBe(true);
    expect(Reflect.getMetadata(ROLES_KEY, proto.createCase)).toBeUndefined();
    for (const h of ['getMine', 'getMineById']) {
      expect([...Reflect.getMetadata(ROLES_KEY, proto[h])].sort()).toEqual([UserRole.PARENT, UserRole.STUDENT].sort());
      expect(passes(h, 'parent')).toBe(true);
      expect(passes(h, 'student')).toBe(true);
      expect(passes(h, 'teacher')).toBe(false);          // staff read ANY case through the staff routes, not 'mine'
    }
  });
  it('route order: "mine" is declared before ":id" so it is never read as a case id', () => {
    const names = Object.getOwnPropertyNames(proto);
    expect(names.indexOf('getMine')).toBeLessThan(names.indexOf('getById'));
    expect(names.indexOf('getMineById')).toBeLessThan(names.indexOf('getById'));
  });
});

const oid = () => new Types.ObjectId();
const ME = oid(), OTHER = oid(), CHILD = oid(), STRANGER_CHILD = oid();
const parent: any = { userId: String(ME), role: 'parent', name: 'Pat Parent', schoolSlug: 's', guardianOfStudentIds: [String(CHILD)] };
function svc(rows: any[] = []) {
  const created: any[] = [];
  const caseModel: any = function (this: any, d: any) { Object.assign(this, d, { caseNumber: 'CASE-1', save: async () => { created.push(this); } }); };
  caseModel.find = jest.fn((f: any) => { const c: any = { sort: () => c, skip: () => c, limit: () => c, lean: async () => rows.filter((r) => String(r.raisedByUserId) === String(f.raisedByUserId) && r.schoolSlug === f.schoolSlug) }; return c; });
  caseModel.countDocuments = jest.fn(async (f: any) => rows.filter((r) => String(r.raisedByUserId) === String(f.raisedByUserId) && r.schoolSlug === f.schoolSlug).length);
  caseModel.findOne = jest.fn((f: any) => ({ lean: async () => rows.find((r) => String(r._id) === String(f._id) && r.schoolSlug === f.schoolSlug && String(r.raisedByUserId) === String(f.raisedByUserId)) || null }));
  const s = new (ComplaintsService as any)({ findById: () => ({ lean: async () => null }) }, caseModel, { findById: () => ({ lean: async () => null }) }, { sendEmail: jest.fn() });
  return { s: s as ComplaintsService, created };
}
const row = (over: any = {}) => ({ _id: oid(), caseNumber: 'CASE-9', title: 'Bus late', description: 'd', status: 'in_process', caseGroup: 'Transport', caseType: 'Bus', priority: 'high', raisedByUserId: ME, schoolSlug: 's', createdAt: new Date(), dueBy: new Date(),
  assignedToId: oid(), assignedToName: 'Mr Staff', remarks: [{ text: 'internal note', addedBy: 'Mr Staff' }], escalations: [{ level: 1 }], reassignments: [{ toName: 'x' }], notifiedAssignmentStatus: 'sent', campusId: oid(), raisedByPhone: '0300', ...over });

describe('parent creates only what a parent may set', () => {
  it('staff-side fields are dropped or derived from the token (priority, SLA, assignee, requester identity, contact, campus)', async () => {
    const { s, created } = svc();
    await s.createCase('s', { title: ' Bus late ', description: 'It is late', priority: 'urgent', slaHours: 1, assignedToId: String(oid()), assignedToName: 'The Principal', assignedDesignation: 'Principal',
      raisedByName: 'Someone Else', raisedByType: 'staff', raisedByPhone: '0300', raisedByEmail: 'x@y', campusId: String(oid()), status: 'closed' }, parent);
    const c = created[0];
    expect(c).toMatchObject({ title: 'Bus late', priority: 'medium', raisedByType: 'parent', raisedByName: 'Pat Parent', status: 'open', assignedToId: null, campusId: null });
    expect(c.assignedToName).toBeUndefined(); expect(c.assignedDesignation).toBeUndefined(); expect(c.raisedByPhone).toBeUndefined(); expect(c.raisedByEmail).toBeUndefined();
    expect(String(c.raisedByUserId)).toBe(String(ME));
    expect(c.slaHours).toBe(48);
  });
  it('a child must be one of the parent\'s OWN linked children (403 otherwise); a malformed id is 400; a title and description are required', async () => {
    const { s, created } = svc();
    await s.createCase('s', { title: 't', description: 'd', studentId: String(CHILD) }, parent);
    expect(String(created[0].studentId)).toBe(String(CHILD));
    await expect(s.createCase('s', { title: 't', description: 'd', studentId: String(STRANGER_CHILD) }, parent)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(s.createCase('s', { title: 't', description: 'd', studentId: 'x' }, parent)).rejects.toBeInstanceOf(BadRequestException);
    await expect(s.createCase('s', { title: '', description: 'd' }, parent)).rejects.toBeInstanceOf(BadRequestException);
    expect(created).toHaveLength(1);
  });
  it('a STAFF creator keeps today\'s behaviour (can name an assignee and priority) and is stamped as raisedByUserId', async () => {
    const { s, created } = svc();
    await s.createCase('s', { title: 't', description: 'd', priority: 'urgent', raisedByName: 'Front desk' }, { userId: String(ME), role: 'admin', name: 'A' } as any);
    expect(created[0]).toMatchObject({ priority: 'urgent', raisedByName: 'Front desk' });
    expect(String(created[0].raisedByUserId)).toBe(String(ME));
  });
});

describe('parent reads ONLY their own cases, in the parent projection', () => {
  it('list: own cases of this school only, never another parent\'s or another school\'s', async () => {
    const mine = row(), others = row({ raisedByUserId: OTHER }), elsewhere = row({ schoolSlug: 'other' });
    const { s } = svc([mine, others, elsewhere]);
    const r = await s.getMyCases('s', parent);
    expect(r.items.map((i: any) => i.id)).toEqual([String(mine._id)]);
    expect(r.total).toBe(1);
  });
  it('projection: no assignee, remarks, escalations, reassignments, notification outcome, campus or contact data; resolution only when closed', async () => {
    const open = row(), closed = row({ status: 'closed', resolutionNotes: 'Fixed the route', closedAt: new Date() });
    const { s } = svc([open, closed]);
    const items = (await s.getMyCases('s', parent)).items as any[];
    for (const i of items) {
      expect(Object.keys(i).sort()).toEqual(['caseGroup', 'caseNumber', 'caseType', 'closedAt', 'createdAt', 'description', 'dueBy', 'id', 'priority', 'resolution', 'status', 'studentId', 'studentName', 'title'].sort());
      expect(JSON.stringify(i)).not.toMatch(/internal note|Mr Staff|0300|notifiedAssignment|escalations|reassignments/);
    }
    expect(items.find((i) => i.status === 'closed').resolution).toBe('Fixed the route');
    expect(items.find((i) => i.status !== 'closed').resolution).toBeNull();
  });
  it('read one: own case yes; another parent\'s, another school\'s and a missing case are the same 404; malformed id 400; no account 403', async () => {
    const mine = row(), others = row({ raisedByUserId: OTHER }), elsewhere = row({ schoolSlug: 'other' });
    const { s } = svc([mine, others, elsewhere]);
    expect((await s.getMyCase(String(mine._id), 's', parent) as any).id).toBe(String(mine._id));
    for (const x of [others, elsewhere]) await expect(s.getMyCase(String(x._id), 's', parent)).rejects.toBeInstanceOf(NotFoundException);
    await expect(s.getMyCase(String(oid()), 's', parent)).rejects.toBeInstanceOf(NotFoundException);
    await expect(s.getMyCase('nope', 's', parent)).rejects.toBeInstanceOf(BadRequestException);
    await expect(s.getMyCase(String(mine._id), 's', { role: 'parent' } as any)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
