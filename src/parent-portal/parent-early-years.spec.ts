import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Types } from 'mongoose';
import { ROLES_KEY } from '../auth/decorators';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/roles.enum';
import { ParentEarlyYearsController } from './parent-early-years.controller';
import { ParentEarlyYearsService, evidenceKeyOf, EY_SIGNED_URL_SECONDS } from './parent-early-years.service';

const oid = () => new Types.ObjectId();
const SCHOOL = 'school-a';
const mine = oid().toString(), other = oid().toString(), entryId = oid().toString();
const parent = (over: any = {}) => ({ role: 'parent', userId: 'u1', schoolSlug: SCHOOL, guardianOfStudentIds: [mine], ...over });

// Chainable fake model: records the filter and the select, returns the configured rows.
function model(rows: any, count = Array.isArray(rows) ? rows.length : rows ? 1 : 0) {
  const seen: any = {};
  const q: any = {};
  for (const m of ['sort', 'skip', 'limit']) q[m] = jest.fn((v: any) => { seen[m] = v; return q; });
  q.select = jest.fn((s: any) => { seen.select = s; return q; });
  q.lean = jest.fn(() => Promise.resolve(rows));
  return {
    seen, q,
    find: jest.fn((f: any) => { seen.filter = f; return q; }),
    findOne: jest.fn((f: any) => { seen.filter = f; return q; }),
    countDocuments: jest.fn(async (f: any) => { seen.countFilter = f; return count; }),
  };
}

const eyStudent = { _id: mine, firstName: 'Ayesha', lastName: 'Khan', currentGrade: 'Nursery', currentSection: 'A', classTeacher: 'Ms Sara', programType: 'early-years', currentAcademicYear: '2025-26' };

function build(over: { student?: any; portfolio?: any; observations?: any; skills?: any; year?: any; portfolioCount?: number; observationCount?: number; signer?: jest.Mock } = {}) {
  const student = model('student' in over ? over.student : eyStudent);
  const portfolio = model('portfolio' in over ? over.portfolio : [], over.portfolioCount);
  const observations = model('observations' in over ? over.observations : [], over.observationCount);
  const skills = model('skills' in over ? over.skills : []);
  const years = model('year' in over ? over.year : { name: '2025-26' });
  const upload: any = { getSignedUrl: over.signer || jest.fn(async (key: string) => `https://signed.example/${key}?sig=1`) };
  const service = new ParentEarlyYearsService(student as any, observations as any, portfolio as any, skills as any, years as any, upload);
  return { service, student, portfolio, observations, skills, years, upload };
}

// ── guards ───────────────────────────────────────────────────────
const proto: any = ParentEarlyYearsController.prototype;
const ROUTES = ['summary', 'portfolio', 'portfolioEntry', 'observations'];
const guard = new RolesGuard(new Reflector());
const passes = (handler: string, role: string) => {
  const ctx: any = { getHandler: () => proto[handler], getClass: () => ParentEarlyYearsController, switchToHttp: () => ({ getRequest: () => ({ user: { role, schoolSlug: SCHOOL } }) }) };
  try { return guard.canActivate(ctx) === true; } catch { return false; }
};

describe('parent Early Years: roles', () => {
  it('the controller is parent-only at class level and declares exactly the four read routes', () => {
    expect(Reflect.getMetadata(ROLES_KEY, ParentEarlyYearsController)).toEqual([UserRole.PARENT]);
    const routes = Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor' && Reflect.getMetadata('path', proto[n]) !== undefined).sort();
    expect(routes).toEqual([...ROUTES].sort());
    for (const n of routes) expect(Reflect.getMetadata('method', proto[n])).toBe(0); // 0 = GET: nothing writes
  });
  it.each(ROUTES)('%s: parent passes', (h) => { expect(passes(h, UserRole.PARENT)).toBe(true); });
  it.each(ROUTES)('%s: every other role is refused', (h) => {
    for (const r of [UserRole.STUDENT, UserRole.TEACHER, UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.INSTITUTION_OWNER, UserRole.SUPER_ADMIN,
      UserRole.RESELLER_ADMIN, UserRole.RESELLER_SUPPORT, UserRole.FINANCE_MANAGER, UserRole.HR_MANAGER, UserRole.LIBRARIAN, UserRole.SUPPORT_STAFF, 'unknown_role']) {
      expect(passes(h, r)).toBe(false);
    }
  });
});

// ── ownership, school ────────────────────────────────────────────
describe('parent Early Years: ownership and school', () => {
  it('own child: summary 200 for an Early Years child', async () => {
    const { service } = build({ portfolioCount: 3, observationCount: 2 });
    await expect(service.getSummary(parent(), mine)).resolves.toMatchObject({
      isEarlyYears: true, programme: 'early-years', grade: 'Nursery', section: 'A', keyPerson: 'Ms Sara', sharedPortfolioCount: 3, sharedObservationCount: 2,
    });
  });
  it('a child that is not in an Early Years programme: summary says so and carries no counts, other routes 404', async () => {
    const b = build({ student: { ...eyStudent, programType: 'k12' } });
    await expect(b.service.getSummary(parent(), mine)).resolves.toEqual({ studentId: mine, firstName: 'Ayesha', lastName: 'Khan', isEarlyYears: false, programme: 'k12' });
    await expect(b.service.listPortfolio(parent(), mine)).rejects.toBeInstanceOf(NotFoundException);
    await expect(b.service.getPortfolioEntry(parent(), mine, entryId)).rejects.toBeInstanceOf(NotFoundException);
    await expect(b.service.listObservations(parent(), mine)).rejects.toBeInstanceOf(NotFoundException);
    expect(b.portfolio.find).not.toHaveBeenCalled();
    expect(b.observations.find).not.toHaveBeenCalled();
  });
  it('another child in the same school (not linked): 403 on every route, and no database read at all', async () => {
    const b = build();
    for (const call of [
      () => b.service.getSummary(parent(), other), () => b.service.listPortfolio(parent(), other),
      () => b.service.getPortfolioEntry(parent(), other, entryId), () => b.service.listObservations(parent(), other),
    ]) await expect(call()).rejects.toBeInstanceOf(ForbiddenException);
    expect(b.student.findOne).not.toHaveBeenCalled();
    expect(b.portfolio.find).not.toHaveBeenCalled();
  });
  it('another school: the child is looked up by id AND the token\'s school; not found there is 404 (a linked id from another school is a 404, not data)', async () => {
    const b = build({ student: null });
    await expect(b.service.listPortfolio(parent({ schoolSlug: 'school-b' }), mine)).rejects.toBeInstanceOf(NotFoundException);
    expect(b.student.findOne).toHaveBeenCalledWith({ _id: mine, schoolSlug: 'school-b' });
    expect(b.portfolio.find).not.toHaveBeenCalled();
  });
  it('the school comes from the token only: a token without one is refused', async () => {
    const b = build();
    await expect(b.service.getSummary(parent({ schoolSlug: undefined }), mine)).rejects.toBeInstanceOf(ForbiddenException);
    expect(b.student.findOne).not.toHaveBeenCalled();
  });
  it('a malformed id is a 400', async () => {
    const b = build();
    await expect(b.service.getSummary(parent({ guardianOfStudentIds: ['nope'] }), 'nope')).rejects.toBeInstanceOf(BadRequestException);
    await expect(b.service.getPortfolioEntry(parent(), mine, 'not-an-id')).rejects.toBeInstanceOf(BadRequestException);
  });
  it('non-parent roles that somehow reach the service are still bound by ownership only for parent/student; the role guard is the gate (documented)', async () => {
    // assertStudentAccess lets staff through by design, which is why the controller carries @Roles(PARENT); covered above.
    expect(Reflect.getMetadata(ROLES_KEY, ParentEarlyYearsController)).toEqual([UserRole.PARENT]);
  });
});

// ── visibility + projection ──────────────────────────────────────
const dbEntry = (over: any = {}) => ({
  _id: oid(), schoolSlug: SCHOOL, studentId: oid(), sourceObservationId: oid(), title: 'Painting', narrative: 'Mixed colours', tryThisAtHome: 'Paint with water',
  evidence: [{ type: 'photo', url: `https://b.s3.ap-south-1.amazonaws.com/${SCHOOL}/ece-evidence/a1.jpg`, caption: 'Our work' }],
  isVisibleToFamily: true, familyResponse: { text: 'internal', respondedBy: 'Staff Name' }, createdAt: new Date('2026-10-01'), updatedAt: new Date(), __v: 0,
  careNote: 'CARE-SECRET', allergies: ['ALLERGY-SECRET'], supportCase: 'SUPPORT-SECRET', ...over,
});
const FORBIDDEN_VALUES = ['CARE-SECRET', 'ALLERGY-SECRET', 'SUPPORT-SECRET', 'internal', 'Staff Name', 'schoolSlug', 'sourceObservationId', 'familyResponse', 'observedBy', 'observedById', '__v'];

describe('parent Early Years: portfolio', () => {
  it('lists only family-visible entries, newest first, scoped to school + child, projected to the allow-list', async () => {
    const b = build({ portfolio: [dbEntry()], portfolioCount: 1 });
    const res: any = await b.service.listPortfolio(parent(), mine);
    expect(b.portfolio.seen.filter).toEqual({ schoolSlug: SCHOOL, studentId: new Types.ObjectId(mine), isVisibleToFamily: true });
    expect(b.portfolio.seen.sort).toEqual({ createdAt: -1, _id: -1 });
    expect(b.portfolio.seen.select).toBe('title narrative tryThisAtHome evidence createdAt');
    expect(b.portfolio.seen.countFilter).toEqual(b.portfolio.seen.filter);
    expect(Object.keys(res.items[0]).sort()).toEqual(['createdAt', 'id', 'media', 'narrative', 'title', 'tryThisAtHome']);
    const json = JSON.stringify(res);
    for (const v of FORBIDDEN_VALUES) expect(json).not.toContain(v);
    expect(res).toMatchObject({ page: 1, limit: 20, total: 1, hasMore: false });
  });
  it('unshared entries are never returned: the filter itself excludes them, and nothing is reinstated afterwards', async () => {
    const b = build({ portfolio: [], portfolioCount: 0 });
    await b.service.listPortfolio(parent(), mine);
    expect(b.portfolio.seen.filter.isVisibleToFamily).toBe(true);
    const res: any = await b.service.listPortfolio(parent(), mine);
    expect(res.items).toEqual([]);
  });
  it('paging: limit is clamped to 50, hasMore follows the total', async () => {
    const b = build({ portfolio: [dbEntry(), dbEntry()], portfolioCount: 5 });
    const res: any = await b.service.listPortfolio(parent(), mine, 2, 999);
    expect(b.portfolio.seen.limit).toBe(50);
    expect(b.portfolio.seen.skip).toBe(50);
    expect(res).toMatchObject({ page: 2, limit: 50, total: 5 });
    const small: any = await build({ portfolio: [dbEntry(), dbEntry()], portfolioCount: 5 }).service.listPortfolio(parent(), mine, 1, 2);
    expect(small.hasMore).toBe(true);
  });
  it('entry detail: asked for by id + school + this child + visible; an unshared entry, another child\'s entry or another school\'s is "not found"', async () => {
    const hit = build({ portfolio: dbEntry({ _id: entryId }) });
    const res: any = await hit.service.getPortfolioEntry(parent(), mine, entryId);
    expect(hit.portfolio.seen.filter).toEqual({ _id: entryId, schoolSlug: SCHOOL, studentId: new Types.ObjectId(mine), isVisibleToFamily: true });
    expect(Object.keys(res).sort()).toEqual(['createdAt', 'id', 'media', 'narrative', 'title', 'tryThisAtHome']);
    for (const v of FORBIDDEN_VALUES) expect(JSON.stringify(res)).not.toContain(v);
    const miss = build({ portfolio: null });
    await expect(miss.service.getPortfolioEntry(parent(), mine, entryId)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('parent Early Years: signed media', () => {
  const entryWith = (evidence: any[]) => dbEntry({ evidence });
  const url = (key: string) => `https://b.s3.ap-south-1.amazonaws.com/${key}`;

  it('signs only this school\'s ece-evidence keys, with a short expiry', async () => {
    const signer = jest.fn(async (key: string, exp?: number) => `https://signed.example/${key}?exp=${exp}`);
    const b = build({ portfolio: [entryWith([{ type: 'photo', url: url(`${SCHOOL}/ece-evidence/own.jpg`), caption: 'c' }])], portfolioCount: 1, signer });
    const res: any = await b.service.listPortfolio(parent(), mine);
    expect(signer).toHaveBeenCalledTimes(1);
    expect(signer).toHaveBeenCalledWith(`${SCHOOL}/ece-evidence/own.jpg`, EY_SIGNED_URL_SECONDS);
    expect(EY_SIGNED_URL_SECONDS).toBeLessThanOrEqual(900);
    expect(res.items[0].media).toEqual([{ type: 'photo', url: `https://signed.example/${SCHOOL}/ece-evidence/own.jpg?exp=900`, caption: 'c' }]);
    expect(JSON.stringify(res)).not.toContain('amazonaws'); // the stored raw url is never returned
  });
  it('drops (and never signs) media pointing at another school, another folder, traversal, or junk', async () => {
    const signer = jest.fn(async (k: string) => `s:${k}`);
    const bad = [
      url('school-b/ece-evidence/x.jpg'), url(`${SCHOOL}/documents/payslip.pdf`), url(`${SCHOOL}/ece-evidence/../documents/x.pdf`),
      url(`${SCHOOL}/ece-evidence/a/b.jpg`), `${SCHOOL}-evil/ece-evidence/x.jpg`, 'javascript:alert(1)', '', null, 42,
    ].map((u) => ({ type: 'photo', url: u }));
    const b = build({ portfolio: [entryWith(bad)], portfolioCount: 1, signer });
    const res: any = await b.service.listPortfolio(parent(), mine);
    expect(signer).not.toHaveBeenCalled();
    expect(res.items[0].media).toEqual([]);
  });
  it('a signing failure (storage not configured) keeps the item with url null instead of failing the page', async () => {
    const signer = jest.fn(async () => { throw new Error('storage not configured'); });
    const b = build({ portfolio: [entryWith([{ type: 'photo', url: url(`${SCHOOL}/ece-evidence/own.jpg`) }])], portfolioCount: 1, signer });
    const res: any = await b.service.listPortfolio(parent(), mine);
    expect(res.items[0].media).toEqual([{ type: 'photo', url: null, caption: null }]);
  });
  it.each([
    [`https://b.s3.ap-south-1.amazonaws.com/${SCHOOL}/ece-evidence/a%20b.jpg`, `${SCHOOL}/ece-evidence/a b.jpg`],
    [`${SCHOOL}/ece-evidence/a.jpg`, `${SCHOOL}/ece-evidence/a.jpg`],
    [`/${SCHOOL}/ece-evidence/a.jpg`, `${SCHOOL}/ece-evidence/a.jpg`],
    [`https://b.s3.amazonaws.com/${SCHOOL}/ece-evidence/a.jpg?X-Amz-Signature=1`, `${SCHOOL}/ece-evidence/a.jpg`], // the query is dropped, the key is what gets signed
    [`${SCHOOL}/ece-evidence/a.jpg?x=1`, null],
    [`${SCHOOL}/ece-evidence/`, null], ['', null], [undefined, null], [{}, null],
  ])('evidenceKeyOf(%p)', (input, expected) => { expect(evidenceKeyOf(input as any, SCHOOL)).toBe(expected); });
});

describe('parent Early Years: observations', () => {
  const dbObs = (over: any = {}) => ({
    _id: oid(), schoolSlug: SCHOOL, studentId: oid(), observedBy: 'Ms Sara', observedById: oid(), observationType: 'learning_story', context: 'INTERNAL-CONTEXT',
    narrative: 'Built a tower', nextStep: 'Count blocks', skillMappings: [{ skillId: 'sk1', progressionLevel: 'Developing' }, { skillId: 'sk2', progressionLevel: 'Secure' }],
    evidence: [{ type: 'photo', url: `${SCHOOL}/ece-evidence/o.jpg` }], isSharedWithFamily: true, academicYearLabel: '2025-26', createdAt: new Date(), ...over,
  });
  it('returns only shared observations, school-scoped skill names, no staff names, ids or internal context', async () => {
    const b = build({ observations: [dbObs()], observationCount: 1, skills: [{ _id: 'sk1', name: 'Pencil Control' }] });
    const res: any = await b.service.listObservations(parent(), mine);
    expect(b.observations.seen.filter).toEqual({ schoolSlug: SCHOOL, studentId: new Types.ObjectId(mine), isSharedWithFamily: true, academicYearLabel: '2025-26' });
    expect(b.skills.seen.filter.schoolSlug).toBe(SCHOOL);
    expect(Object.keys(res.items[0]).sort()).toEqual(['createdAt', 'id', 'learningAreas', 'media', 'narrative', 'nextStep', 'type']);
    expect(res.items[0].learningAreas).toEqual([{ skill: 'Pencil Control', level: 'Developing' }]); // unresolved skill dropped
    const json = JSON.stringify(res);
    for (const v of ['Ms Sara', 'observedBy', 'observedById', 'INTERNAL-CONTEXT', 'schoolSlug', 'isSharedWithFamily', 'academicYearLabel']) expect(json).not.toContain(v);
  });
  it('an unshared observation is excluded by the filter', async () => {
    const b = build({ observations: [], observationCount: 0 });
    await b.service.listObservations(parent(), mine);
    expect(b.observations.seen.filter.isSharedWithFamily).toBe(true);
  });
  describe('academic year is worked out on the server', () => {
    it('the list and the summary count use the school\'s CURRENT year (first isCurrent year of this school, newest start first)', async () => {
      const b = build({ observations: [], observationCount: 0, year: { name: ' 2026-27 ' } });
      await b.service.listObservations(parent(), mine);
      expect(b.years.seen.filter).toEqual({ schoolSlug: SCHOOL, isCurrent: true });
      expect(b.years.seen.sort).toEqual({ startDate: -1 });
      expect(b.observations.seen.filter).toMatchObject({ isSharedWithFamily: true, academicYearLabel: '2026-27' });
      const s = build({ observationCount: 0, year: { name: '2026-27' } });
      await s.service.getSummary(parent(), mine);
      expect(s.observations.seen.countFilter).toMatchObject({ academicYearLabel: '2026-27' });
    });

    it('an observation of another year is excluded by that filter (the label is part of the query, not applied afterwards)', async () => {
      const b = build({ observations: [], observationCount: 0, year: { name: '2025-26' } });
      await b.service.listObservations(parent(), mine);
      expect(b.observations.seen.filter.academicYearLabel).toBe('2025-26');
      expect(b.observations.seen.countFilter.academicYearLabel).toBe('2025-26');
    });

    it('a year sent by the client has no effect: the service has no parameter for it, and the controller does not read the header', () => {
      expect(ParentEarlyYearsService.prototype.listObservations.length).toBeLessThanOrEqual(4);
      expect(ParentEarlyYearsService.prototype.getSummary.length).toBeLessThanOrEqual(2);
      const ctl = fs.readFileSync(path.join(__dirname, 'parent-early-years.controller.ts'), 'utf8').split('\n').filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//')).join('\n');
      expect(ctl).not.toMatch(/x-academic-year|headers/i);
    });

    it('the school looked up is the token\'s, so another school\'s year never applies', async () => {
      const b = build({ observations: [], observationCount: 0 });
      await b.service.listObservations(parent({ schoolSlug: 'school-b' }), mine).catch(() => undefined);
      // child lookup comes first and is by the token's school; the year lookup is only reached with that same school
      expect(b.student.seen.filter).toEqual({ _id: mine, schoolSlug: 'school-b' });
    });

    it('no current year configured: no year filter (shared items stay visible) rather than hiding the record', async () => {
      const none = build({ observations: [], observationCount: 0, year: null });
      await none.service.listObservations(parent(), mine);
      expect(none.observations.seen.filter.academicYearLabel).toBeUndefined();
      const blank = build({ observations: [], observationCount: 0, year: { name: '   ' } });
      await blank.service.listObservations(parent(), mine);
      expect(blank.observations.seen.filter.academicYearLabel).toBeUndefined();
    });

    it('portfolio entries are not year-filtered (the schema has no year on them)', async () => {
      const b = build({ portfolio: [], portfolioCount: 0 });
      await b.service.listPortfolio(parent(), mine);
      expect(b.portfolio.seen.filter.academicYearLabel).toBeUndefined();
      expect(b.years.findOne).not.toHaveBeenCalled();
    });
  });
});

describe('parent Early Years: no sensitive data path exists', () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const src = strip(fs.readFileSync(path.join(__dirname, 'parent-early-years.service.ts'), 'utf8'));
  it('the service reads only students, observations, portfolio entries, skills and the school year, and never mentions care, allergy, support or medication', () => {
    expect(src).not.toMatch(/care|allerg|support|medic|injur|toilet|nap\b|familyResponse|observedBy|observedById|(\.|'|")context\b|\bcontext:/i);
    const models = [...src.matchAll(/@InjectModel\((\w+)\.name\)/g)].map((m) => m[1]).sort();
    expect(models).toEqual(['AcademicYear', 'ECEObservation', 'ECEPortfolioEntry', 'ECESkill', 'Student']);
  });
  it('the module registers only the three read-only ECE models for this feature', () => {
    const mod = fs.readFileSync(path.join(__dirname, 'parent-portal.module.ts'), 'utf8');
    const eceImports = [...mod.matchAll(/from '\.\.\/ece\/([^']+)'/g)].map((m) => m[1]).sort();
    expect(eceImports).toEqual(['schemas/observation.schema', 'schemas/ontology.schema', 'schemas/portfolio-entry.schema']);
  });
  it('nothing here writes: no create/update/delete/save call in the service', () => {
    expect(src).not.toMatch(/\.(create|update\w*|delete\w*|save|insert\w*|bulkWrite|findOneAndUpdate)\(/);
  });
});
