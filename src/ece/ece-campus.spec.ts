import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { assertEceStudentInScope, eceCampusOf, eceScopedStudentIds } from './ece-scope.util';
import { EceService } from './ece.service';
import { EceController } from './ece.controller';

// Round 2: Early Years campus scope. Campus-/teacher-level callers see only children of their own campus; institution-level callers see all.
const CAMPUS_A = new Types.ObjectId().toHexString();
const CAMPUS_B = new Types.ObjectId().toHexString();
const SID = new Types.ObjectId().toHexString();
const teacher = { role: 'teacher', userId: 'u1', campusId: CAMPUS_A } as any;
const principal = { role: 'principal', userId: 'u2', campusId: CAMPUS_A } as any;
const owner = { role: 'institution_owner', userId: 'u3' } as any;
const noCampusTeacher = { role: 'teacher', userId: 'u4' } as any;
const studentModel = (campusId: any, exists = true) => ({ findOne: jest.fn(() => ({ select: () => ({ lean: async () => (exists ? { campusId } : null) }) })) });

describe('eceCampusOf', () => {
  it('teacher and campus-level roles are scoped to their own campus; owner / super_admin are not', () => {
    expect(eceCampusOf(teacher)).toBe(CAMPUS_A);
    expect(eceCampusOf(principal)).toBe(CAMPUS_A);
    expect(eceCampusOf(owner)).toBeUndefined();
    expect(eceCampusOf({ role: 'super_admin' } as any)).toBeUndefined();
    expect(eceCampusOf(undefined)).toBeUndefined();
  });
  it('a campus-level caller with no campus fails closed with the usual clear 403', () => {
    expect(() => eceCampusOf(noCampusTeacher)).toThrow(ForbiddenException);
  });
});

describe('assertEceStudentInScope', () => {
  it('own campus passes; other campus 403; a child without a campus is hidden from campus-level callers', async () => {
    await expect(assertEceStudentInScope(studentModel(CAMPUS_A), 'sch', SID, teacher)).resolves.toBeUndefined();
    await expect(assertEceStudentInScope(studentModel(CAMPUS_B), 'sch', SID, teacher)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(assertEceStudentInScope(studentModel(undefined), 'sch', SID, teacher)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('institution-level callers see every child of the school, with or without a campus', async () => {
    await expect(assertEceStudentInScope(studentModel(CAMPUS_B), 'sch', SID, owner)).resolves.toBeUndefined();
    await expect(assertEceStudentInScope(studentModel(undefined), 'sch', SID, owner)).resolves.toBeUndefined();
  });
  it('the lookup is school-scoped: another school\'s child is a 404 for everyone; malformed id is a 400', async () => {
    const m = studentModel(CAMPUS_A, false);
    await expect(assertEceStudentInScope(m, 'sch', SID, owner)).rejects.toBeInstanceOf(NotFoundException);
    expect(m.findOne).toHaveBeenCalledWith({ _id: SID, schoolSlug: 'sch' });
    for (const bad of ['nope', '', undefined, null]) await expect(assertEceStudentInScope(studentModel(CAMPUS_A), 'sch', bad, owner)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('eceScopedStudentIds', () => {
  it('campus-scoped: the ids of that campus\'s children in this school; institution-level: undefined (no filter)', async () => {
    const find = jest.fn(() => ({ select: () => ({ lean: async () => [{ _id: 'a' }, { _id: 'b' }] }) }));
    expect(await eceScopedStudentIds({ find }, 'sch', teacher)).toEqual(['a', 'b']);
    expect(find).toHaveBeenCalledWith({ schoolSlug: 'sch', campusId: CAMPUS_A });
    expect(await eceScopedStudentIds({ find }, 'sch', owner)).toBeUndefined();
  });
});

describe('EceService lists are campus-scoped', () => {
  function svc() {
    const queries: any[] = [];
    const s: any = Object.create(EceService.prototype);
    s.studentModel = { find: jest.fn((q: any) => { queries.push(q); return { select: () => ({ sort: () => ({ lean: async () => [] }), lean: async () => [] }) }; }), findOne: jest.fn(() => ({ select: () => ({ lean: async () => ({ campusId: CAMPUS_A }) }) })) };
    s.observationModel = { find: jest.fn((f: any) => { queries.push(f); return { sort: () => ({ lean: async () => [] }) }; }) };
    s.supportCaseModel = { find: jest.fn((f: any) => { queries.push(f); return { sort: () => ({ lean: async () => [] }) }; }) };
    return { s: s as EceService, queries };
  }
  it('getChildren adds the campus for a teacher and nothing for the owner', async () => {
    const a = svc(); await a.s.getChildren('sch', teacher);
    expect(a.queries[0]).toEqual({ schoolSlug: 'sch', programType: 'early-years', status: 'active', campusId: CAMPUS_A });
    const b = svc(); await b.s.getChildren('sch', owner);
    expect(b.queries[0]).toEqual({ schoolSlug: 'sch', programType: 'early-years', status: 'active' });
  });
  it('getObservations without a child is limited to the campus\'s children; with a child it checks that child first', async () => {
    const a = svc();
    a.s['studentModel'].find = jest.fn(() => ({ select: () => ({ lean: async () => [{ _id: 'k1' }] }) })) as any;
    await a.s.getObservations('sch', {}, teacher);
    expect(a.queries[0]).toMatchObject({ schoolSlug: 'sch', studentId: { $in: ['k1'] } });
    const b = svc();
    b.s['studentModel'].findOne = jest.fn(() => ({ select: () => ({ lean: async () => ({ campusId: CAMPUS_B }) }) })) as any;
    await expect(b.s.getObservations('sch', { studentId: SID }, teacher)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('getSupportCases for a child at another campus is a 403', async () => {
    const a = svc();
    a.s['studentModel'].findOne = jest.fn(() => ({ select: () => ({ lean: async () => ({ campusId: CAMPUS_B }) }) })) as any;
    await expect(a.s.getSupportCases('sch', SID, undefined, teacher)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('a record addressed by id (portfolio / care / support) is checked through its child; unknown record 404', async () => {
    const s: any = Object.create(EceService.prototype);
    s.studentModel = studentModel(CAMPUS_B);
    s.portfolioModel = { findOne: () => ({ select: () => ({ lean: async () => ({ studentId: SID }) }) }) };
    s.careRecordModel = { findOne: () => ({ select: () => ({ lean: async () => null }) }) };
    await expect(s.assertRecordInScope('portfolio', SID, 'sch', teacher)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(s.assertRecordInScope('portfolio', SID, 'sch', owner)).resolves.toBeUndefined();
    await expect(s.assertRecordInScope('care', SID, 'sch', owner)).rejects.toBeInstanceOf(NotFoundException);
    await expect(s.assertRecordInScope('care', 'bad', 'sch', owner)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('EceController applies the scope before touching a child', () => {
  const mk = () => {
    const calls: string[] = [];
    const service: any = new Proxy({}, { get: (_t, k: string) => (k === 'assertStudentInScope' ? async () => { calls.push('scope'); } : k === 'assertRecordInScope' ? async () => { calls.push('scope'); } : async () => { calls.push(k); return {}; }) });
    return { ctrl: new EceController(service), calls };
  };
  const req = { user: { ...teacher, schoolSlug: 'sch', name: 'T' }, headers: {} };
  it('every student-targeted route checks the scope first (scope, then the action)', async () => {
    const { ctrl, calls } = mk();
    await ctrl.createObservation(req, { studentId: SID } as any);
    await ctrl.quickObserve(req, { studentId: SID } as any);
    await ctrl.getProfile(req, SID);
    await ctrl.updateProfileTags(req, SID, {});
    await ctrl.getPortfolio(req, SID);
    await ctrl.createPortfolioEntry(req, { studentId: SID } as any);
    await ctrl.shareEntry(req, SID, true);
    await ctrl.respondToEntry(req, SID, { text: 'x', respondedBy: 'y' } as any);
    await ctrl.getCareRecords(req, SID);
    await ctrl.createCareRecord(req, { studentId: SID } as any);
    await ctrl.updateCareRecord(req, SID, {});
    await ctrl.getStudentAllergies(req, SID);
    await ctrl.getSupportCaseById(req, SID);
    await ctrl.createSupportCase(req, { studentId: SID } as any);
    await ctrl.addSupportStrategy(req, SID, {} as any);
    await ctrl.addSupportReview(req, SID, {} as any);
    await ctrl.updateSupportCase(req, SID, {} as any);
    const scopeChecks = calls.filter((c) => c === 'scope').length;
    expect(scopeChecks).toBe(17);
    for (let i = 0; i < calls.length; i += 2) { expect(calls[i]).toBe('scope'); expect(calls[i + 1]).not.toBe('scope'); }
  });
  it('when the scope check throws, the action is never run', async () => {
    const calls: string[] = [];
    const service: any = { assertStudentInScope: async () => { throw new ForbiddenException('no'); }, createObservation: async () => { calls.push('created'); } };
    await expect(new EceController(service).createObservation(req, { studentId: SID } as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(calls).toEqual([]);
  });
});
