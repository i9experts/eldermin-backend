import { Schema, Types } from 'mongoose';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sift = require('sift');
import { idMatchPlugin } from './id-match.plugin';
import { TeachingService } from '../../modules/teaching/teaching.service';
import { PTMService } from '../../modules/teaching/ptm.service';
import { AuthService } from '../../modules/auth/auth.service';
import { AssessmentService } from '../../assessments/assessment.service';
import { UserSchema } from '../../modules/organization/schemas/user.schema';
import { AssignmentSchema } from '../../modules/teaching/schemas/assignment.schema';
import { LessonPlanSchema } from '../../modules/teaching/schemas/lesson-plan.schema';
import { PTMMeetingSchema } from '../../modules/teaching/schemas/ptm-meeting.schema';
import { AssessmentSchema } from '../../assessments/schemas/assessment.schema';
import { SyllabusSchema } from '../../syllabus/schemas/syllabus.schema';
import { CurriculumSchema } from '../../modules/academics/schemas/curriculum.schema';
import { BehaviourRecordSchema } from '../../behaviour/schemas/behaviour.schema';

const T = '64b7f0f0f0f0f0f0f0f0f001';
const T_OTHER = '64b7f0f0f0f0f0f0f0f0f002';
const C = '64b7f0f0f0f0f0f0f0f0f0c1';
const C_OTHER = '64b7f0f0f0f0f0f0f0f0f0c2';
const oid = (s: string) => new Types.ObjectId(s);

/**
 * Deterministic and fully in-memory: no Model / connection is created (a never-connected Mongoose connection buffers
 * and would time out). The plugin is applied to a clone of the real compiled schema and the pre-hooks it registered
 * (and only those) are invoked directly on a minimal Query stand-in.
 */
function pluginHooks(schema: Schema, op: string): Array<(this: any) => void> {
  const clone = schema.clone();
  const pres = () => (((clone as any).s.hooks._pres.get(op) as any[]) || []);
  const before = pres().length;
  idMatchPlugin(clone);
  return pres().slice(before).map((h: any) => h.fn);
}
function throughPlugin(schema: Schema, op: string, filter: any, options: any = {}): Promise<any> {
  let state = filter;
  const q: any = { getOptions: () => options, getFilter: () => state, setQuery: (f: any) => { state = f; } };
  for (const fn of pluginHooks(schema, op)) fn.call(q);
  return Promise.resolve(state);
}
async function aggregateThroughPlugin(schema: Schema, pipeline: any[]): Promise<any[]> {
  const q: any = { pipeline: () => pipeline };
  for (const fn of pluginHooks(schema, 'aggregate')) fn.call(q);
  return pipeline;
}
const matches = (filter: any, doc: any) => sift(filter)(doc);

/** a fake model that records the filter of whichever read it receives and resolves to [] */
function recorder() {
  const calls: any[] = [];
  const chain: any = new Proxy(() => chain, {
    get: (_t, p) => (p === 'then' ? (res: any) => res([]) : chain),
    apply: () => chain,
  });
  const fn = (f: any) => { calls.push(f); return chain; };
  return { model: { find: fn, findOne: fn, countDocuments: fn, calls } as any, calls };
}

describe('Mixed-typed id paths (B0)', () => {
  it('schemas compile to Mixed (the premise of the bug)', () => {
    expect((UserSchema.path('tenantId') as any).instance).toBe('Mixed');
    expect((AssignmentSchema.path('campusId') as any).instance).toBe('Mixed');
  });
});

describe('plugin: both id representations are matched, other ids are not', () => {
  const docs = (extra: any = {}) => ({
    objTenant: { tenantId: oid(T), campusId: oid(C), ...extra },
    strTenant: { tenantId: T, campusId: C, ...extra },
    mixed1: { tenantId: T, campusId: oid(C), ...extra },
    mixed2: { tenantId: oid(T), campusId: C, ...extra },
    otherTenant: { tenantId: oid(T_OTHER), campusId: oid(C), ...extra },
    otherTenantStr: { tenantId: T_OTHER, campusId: C, ...extra },
    otherCampus: { tenantId: oid(T), campusId: oid(C_OTHER), ...extra },
    otherCampusStr: { tenantId: T, campusId: C_OTHER, ...extra },
  });
  const want = ['objTenant', 'strTenant', 'mixed1', 'mixed2'];
  const run = async (schema: Schema, filter: any) => {
    const f = await throughPlugin(schema, 'find', filter);
    return Object.entries(docs()).filter(([, d]) => matches(f, d)).map(([k]) => k).sort();
  };

  it.each([
    ['assignment', AssignmentSchema],
    ['lesson plan', LessonPlanSchema],
    ['ptm meeting', PTMMeetingSchema],
  ])('%s: { tenantId, campusId } as strings (JWT form)', async (_n, schema) => {
    expect(await run(schema as Schema, { tenantId: T, campusId: C })).toEqual([...want].sort());
  });
  it('ObjectId-typed filter values also match string-stored docs', async () => {
    expect(await run(AssignmentSchema, { tenantId: oid(T), campusId: oid(C) })).toEqual([...want].sort());
  });
  it('syllabus / curriculum / behaviour tenant+campus filters', async () => {
    expect(await run(SyllabusSchema, { tenantId: T })).toEqual(
      ['objTenant', 'strTenant', 'mixed1', 'mixed2', 'otherCampus', 'otherCampusStr'].sort());
    expect(await run(CurriculumSchema, { tenantId: T, campusId: C })).toEqual([...want].sort());
    expect(await run(BehaviourRecordSchema, { campusId: C })).toEqual(
      ['objTenant', 'strTenant', 'mixed1', 'mixed2', 'otherTenant', 'otherTenantStr'].sort());
  });
  it('assessment campus filter (schoolSlug is a String path and is untouched)', async () => {
    const f = await throughPlugin(AssessmentSchema, 'find', { schoolSlug: 'demo', campusId: C });
    expect(f.schoolSlug).toBe('demo');
    expect(matches(f, { schoolSlug: 'demo', campusId: oid(C) })).toBe(true);
    expect(matches(f, { schoolSlug: 'demo', campusId: C })).toBe(true);
    expect(matches(f, { schoolSlug: 'demo', campusId: oid(C_OTHER) })).toBe(false);
    expect(matches(f, { schoolSlug: 'other', campusId: oid(C) })).toBe(false);
  });
  it('findOne by _id + tenantId (getMe shape): _id still cast, tenantId widened', async () => {
    const id = new Types.ObjectId();
    const f = await throughPlugin(UserSchema, 'findOne', { _id: String(id), tenantId: T, isActive: true });
    expect(matches(f, { _id: id, tenantId: oid(T), isActive: true })).toBe(true);
    expect(matches(f, { _id: id, tenantId: T, isActive: true })).toBe(true);
    expect(matches(f, { _id: id, tenantId: oid(T_OTHER), isActive: true })).toBe(false);
    expect(matches(f, { _id: id, tenantId: oid(T), isActive: false })).toBe(false);
  });
  it('$in / $or / array-valued id filters', async () => {
    const f = await throughPlugin(LessonPlanSchema, 'find', { teacherId: { $in: [C, C_OTHER] }, $or: [{ campusId: C }, { campusId: null }] });
    expect(matches(f, { teacherId: oid(C), campusId: oid(C) })).toBe(true);
    expect(matches(f, { teacherId: C_OTHER, campusId: null })).toBe(true);
    expect(matches(f, { teacherId: oid(T), campusId: oid(C) })).toBe(false);
  });
  it('is a superset: everything the plain filter matched still matches', async () => {
    const plain = { tenantId: T, campusId: C };
    const widened = await throughPlugin(AssignmentSchema, 'find', plain);
    for (const d of Object.values(docs())) if (matches(plain, d)) expect(matches(widened, d)).toBe(true);
  });
  it('typed (non-Mixed) paths are left to Mongoose', async () => {
    const s = new Schema({ campusId: { type: Schema.Types.ObjectId }, tenantId: String });
    const f = await throughPlugin(s, 'find', { campusId: C, tenantId: T });
    expect(f).toEqual({ campusId: C, tenantId: T });
  });
  it('upserts keep the plain equality filter (so inserted docs get the fields)', async () => {
    const f = await throughPlugin(AssignmentSchema, 'updateOne', { tenantId: T }, { upsert: true });
    expect(f).toEqual({ tenantId: T });
  });
  it('updates/deletes/counts are widened too; aggregate leading $match is widened', async () => {
    for (const op of ['updateMany', 'deleteMany', 'countDocuments', 'findOneAndUpdate']) {
      const f = await throughPlugin(AssignmentSchema, op, { tenantId: T });
      expect(matches(f, { tenantId: oid(T) })).toBe(true);
      expect(matches(f, { tenantId: T })).toBe(true);
    }
    const pl = await aggregateThroughPlugin(AssignmentSchema, [{ $match: { tenantId: oid(T) } }, { $group: { _id: '$status' } }]);
    const m = pl[0].$match;
    expect(matches(m, { tenantId: T })).toBe(true);
    expect(matches(m, { tenantId: oid(T_OTHER) })).toBe(false);
  });
});

describe('array-of-id paths (guardianOfStudentIds)', () => {
  it('element equality / $in matches string and ObjectId elements, not other ids', async () => {
    const f1 = await throughPlugin(UserSchema, 'find', { guardianOfStudentIds: C });
    expect(matches(f1, { guardianOfStudentIds: [oid(C)] })).toBe(true);
    expect(matches(f1, { guardianOfStudentIds: [C] })).toBe(true);
    expect(matches(f1, { guardianOfStudentIds: [oid(C_OTHER)] })).toBe(false);
    const f2 = await throughPlugin(UserSchema, 'find', { guardianOfStudentIds: { $in: [oid(C)] } });
    expect(matches(f2, { guardianOfStudentIds: [C] })).toBe(true);
    expect(matches(f2, { guardianOfStudentIds: [C_OTHER] })).toBe(false);
  });
});

describe('real service filters pass through the plugin and match both forms', () => {
  const both = (schema: Schema, op: string, filter: any, extra: any = {}) =>
    throughPlugin(schema, op, filter).then(f => ({
      asObj: matches(f, { tenantId: oid(T), campusId: oid(C), ...extra }),
      asStr: matches(f, { tenantId: T, campusId: C, ...extra }),
      otherTenant: matches(f, { tenantId: oid(T_OTHER), campusId: oid(C), ...extra }),
      otherCampus: matches(f, { tenantId: T, campusId: C_OTHER, ...extra }),
    }));
  const teacher: any = { role: 'teacher', campusId: C, userId: 'u1' };

  it('TeachingService.getAssignments (campus-scoped teacher)', async () => {
    const { model, calls } = recorder();
    const svc: any = Object.assign(Object.create(TeachingService.prototype), { assignmentModel: model });
    await svc.getAssignments(T, {}, teacher);
    expect(await both(AssignmentSchema, 'find', calls[0])).toEqual({ asObj: true, asStr: true, otherTenant: false, otherCampus: false });
  });
  it('TeachingService.getLessonPlans', async () => {
    const { model, calls } = recorder();
    const svc: any = Object.assign(Object.create(TeachingService.prototype), { lessonPlanModel: model });
    await svc.getLessonPlans(T, {}, teacher);
    expect(await both(LessonPlanSchema, 'find', calls[0])).toEqual({ asObj: true, asStr: true, otherTenant: false, otherCampus: false });
  });
  it('PTMService.getMeetings', async () => {
    const { model, calls } = recorder();
    const svc: any = Object.assign(Object.create(PTMService.prototype), { ptmModel: model });
    await svc.getMeetings(T, {}, teacher);
    expect(await both(PTMMeetingSchema, 'find', calls[0])).toEqual({ asObj: true, asStr: true, otherTenant: false, otherCampus: false });
  });
  it('AssessmentService.findAll', async () => {
    const { model, calls } = recorder();
    const svc: any = Object.assign(Object.create(AssessmentService.prototype), { assessmentModel: model });
    await svc.findAll('demo', { page: 1, limit: 20 } as any, teacher);
    const f = await throughPlugin(AssessmentSchema, 'find', calls[0]);
    expect(matches(f, { schoolSlug: 'demo', campusId: oid(C) })).toBe(true);
    expect(matches(f, { schoolSlug: 'demo', campusId: C })).toBe(true);
    expect(matches(f, { schoolSlug: 'demo', campusId: C_OTHER })).toBe(false);
  });
  it('AuthService.getMe', async () => {
    const { model, calls } = recorder();
    const uid = String(new Types.ObjectId());
    const svc: any = Object.assign(Object.create(AuthService.prototype), {
      userModel: model, rolesService: { getPermissionsForUser: async () => null },
      resolveScopeFieldsForUser: async () => ({}),
    });
    // the fake chain resolves to [] (truthy) so getMe returns normally
    await svc.getMe(uid, T);
    const f = await throughPlugin(UserSchema, 'findOne', calls[0]);
    expect(matches(f, { _id: new Types.ObjectId(uid), tenantId: oid(T), isActive: true })).toBe(true);
    expect(matches(f, { _id: new Types.ObjectId(uid), tenantId: T, isActive: true })).toBe(true);
    expect(matches(f, { _id: new Types.ObjectId(uid), tenantId: T_OTHER, isActive: true })).toBe(false);
  });
});
