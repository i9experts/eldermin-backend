import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TeachingService } from './teaching.service';
import { PTMService } from './ptm.service';
import { BehaviourController } from '../../behaviour/behaviour.controller';

// Fakes only (no DB). Covers the "trusts body identity" fix for the TEACHER role.

const oid = () => new Types.ObjectId();
const me = { userId: oid().toString(), staffId: oid(), profileId: oid() };
const chain = (v: any) => ({ lean: () => Promise.resolve(v), select() { return this; } });

function teacherUser(over: any = {}) {
  return { userId: me.userId, role: 'teacher', name: 'Ms Me', schoolSlug: 's', campusId: undefined, ...over };
}

function makeTeaching(opts: { staff?: any; existingAssignment?: any; existingPlan?: any } = {}) {
  const staff = 'staff' in opts ? opts.staff : { _id: me.staffId, firstName: 'Ms', lastName: 'Me' };
  const staffModel: any = { findOne: jest.fn(() => chain(staff)) };
  const teacherProfileModel: any = { findOne: jest.fn(() => chain({ _id: me.profileId })) };
  const assignmentModel: any = {
    create: jest.fn(async (p: any) => ({ ...p, status: p.status || 'draft' })),
    findOne: jest.fn(async () => opts.existingAssignment ?? null),
  };
  const lessonPlanModel: any = {
    create: jest.fn(async (p: any) => p),
    findOne: jest.fn(() => chain(opts.existingPlan ?? null)),
    findOneAndUpdate: jest.fn(() => chain({})),
  };
  const noop: any = {};
  const service = new TeachingService(
    teacherProfileModel, lessonPlanModel, noop, noop, noop, assignmentModel, noop, noop, noop, noop,
    staffModel, noop, noop, noop, noop,
  );
  return { service, assignmentModel, lessonPlanModel, staffModel };
}

const base = { title: 'T', subject: 'Math', gradeLevel: '5' };

describe('TeachingService createAssignment: teacher identity', () => {
  it('403 when a teacher spoofs another teacherId', async () => {
    const { service, assignmentModel } = makeTeaching();
    await expect(service.createAssignment('t', oid().toString(), { ...base, teacherId: oid().toString() }, teacherUser()))
      .rejects.toThrow(new ForbiddenException('You can only create assignments for yourself'));
    expect(assignmentModel.create).not.toHaveBeenCalled();
  });

  it('accepts my own Staff._id', async () => {
    const { service, assignmentModel } = makeTeaching();
    await service.createAssignment('t', oid().toString(), { ...base, teacherId: me.staffId.toString() }, teacherUser());
    expect(String(assignmentModel.create.mock.calls[0][0].teacherId)).toBe(me.staffId.toString());
  });

  it('accepts my TeacherProfile._id and normalises to my Staff._id', async () => {
    const { service, assignmentModel } = makeTeaching();
    await service.createAssignment('t', oid().toString(), { ...base, teacherId: me.profileId.toString() }, teacherUser());
    expect(String(assignmentModel.create.mock.calls[0][0].teacherId)).toBe(me.staffId.toString());
  });

  it('sets teacherId to my Staff._id when absent', async () => {
    const { service, assignmentModel } = makeTeaching();
    await service.createAssignment('t', oid().toString(), { ...base }, teacherUser());
    expect(String(assignmentModel.create.mock.calls[0][0].teacherId)).toBe(me.staffId.toString());
  });

  it('403 when the teacher has no Staff record', async () => {
    const { service } = makeTeaching({ staff: null });
    await expect(service.createAssignment('t', oid().toString(), { ...base }, teacherUser())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not trust a stale JWT staffId claim (identity read from DB)', async () => {
    const { service, assignmentModel } = makeTeaching();
    const fake = oid().toString();
    await expect(service.createAssignment('t', oid().toString(), { ...base, teacherId: fake }, teacherUser({ staffId: fake }))).rejects.toBeInstanceOf(ForbiddenException);
    expect(assignmentModel.create).not.toHaveBeenCalled();
  });

  it.each(['principal', 'admin', 'academic_coordinator'])('%s keeps today behaviour: may set any teacherId, no Staff lookup', async (role) => {
    const { service, assignmentModel, staffModel } = makeTeaching();
    const other = oid().toString();
    await service.createAssignment('t', oid().toString(), { ...base, teacherId: other }, teacherUser({ role }));
    expect(String(assignmentModel.create.mock.calls[0][0].teacherId)).toBe(other);
    expect(staffModel.findOne).not.toHaveBeenCalled();
  });

  it('non-teacher without teacherId leaves it unset (unchanged)', async () => {
    const { service, assignmentModel } = makeTeaching();
    await service.createAssignment('t', oid().toString(), { ...base }, teacherUser({ role: 'principal' }));
    expect(assignmentModel.create.mock.calls[0][0].teacherId).toBeUndefined();
  });
});

describe('TeachingService updateAssignment / deleteAssignment: ownership', () => {
  const mk = (teacherId: any) => ({ teacherId, status: 'assigned', save: jest.fn(), toObject() { return this; } });

  it('403 when a teacher updates another teacher\'s assignment', async () => {
    const { service } = makeTeaching({ existingAssignment: mk(oid()) });
    await expect(service.updateAssignment('t', 'a1', { title: 'x' }, teacherUser())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('teacher may update own assignment (Staff id and legacy TeacherProfile id)', async () => {
    for (const owner of [me.staffId, me.profileId]) {
      const doc = mk(owner);
      const { service } = makeTeaching({ existingAssignment: doc });
      await service.updateAssignment('t', 'a1', { title: 'x' }, teacherUser());
      expect(doc.save).toHaveBeenCalled();
    }
  });

  it('teacher cannot reassign teacherId to another teacher', async () => {
    const doc = mk(me.staffId);
    const { service } = makeTeaching({ existingAssignment: doc });
    await expect(service.updateAssignment('t', 'a1', { teacherId: oid().toString() }, teacherUser())).rejects.toBeInstanceOf(ForbiddenException);
    expect(doc.save).not.toHaveBeenCalled();
  });

  it('non-teacher can still update any assignment including teacherId (unchanged)', async () => {
    const doc: any = mk(oid());
    const { service, staffModel } = makeTeaching({ existingAssignment: doc });
    const other = oid().toString();
    await service.updateAssignment('t', 'a1', { teacherId: other }, teacherUser({ role: 'principal' }));
    expect(doc.teacherId).toBe(other);
    expect(staffModel.findOne).not.toHaveBeenCalled();
  });

  it('403 when a teacher deletes another teacher\'s assignment', async () => {
    const { service } = makeTeaching({ existingAssignment: { teacherId: oid() } });
    await expect(service.deleteAssignment('t', 'a1', teacherUser())).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('TeachingService lesson plans: teacher identity', () => {
  it('create: spoof -> 403, own profile id normalised, absent set', async () => {
    const { service, lessonPlanModel } = makeTeaching();
    await expect(service.createLessonPlan('t', oid().toString(), { teacherId: oid().toString() }, teacherUser())).rejects.toBeInstanceOf(ForbiddenException);
    await service.createLessonPlan('t', oid().toString(), { teacherId: me.profileId.toString() }, teacherUser());
    await service.createLessonPlan('t', oid().toString(), {}, teacherUser());
    expect(String(lessonPlanModel.create.mock.calls[0][0].teacherId)).toBe(me.staffId.toString());
    expect(String(lessonPlanModel.create.mock.calls[1][0].teacherId)).toBe(me.staffId.toString());
  });

  it('create: principal unchanged', async () => {
    const { service, lessonPlanModel } = makeTeaching();
    const other = oid().toString();
    await service.createLessonPlan('t', oid().toString(), { teacherId: other }, teacherUser({ role: 'principal' }));
    expect(String(lessonPlanModel.create.mock.calls[0][0].teacherId)).toBe(other);
  });

  it('update: another teacher\'s plan -> 403; own plan ok and tenancy fields stripped', async () => {
    const a = makeTeaching({ existingPlan: { teacherId: oid() } });
    await expect(a.service.updateLessonPlan('t', 'p1', { topic: 'x' }, teacherUser())).rejects.toBeInstanceOf(ForbiddenException);
    const b = makeTeaching({ existingPlan: { teacherId: me.profileId } });
    await b.service.updateLessonPlan('t', 'p1', { topic: 'x', tenantId: 'evil', teacherId: me.staffId.toString() }, teacherUser());
    const set = b.lessonPlanModel.findOneAndUpdate.mock.calls[0][1].$set;
    expect(set.tenantId).toBeUndefined();
    expect(String(set.teacherId)).toBe(me.staffId.toString());
  });

  it('update: principal unchanged (raw $set, no lookup)', async () => {
    const { service, lessonPlanModel, staffModel } = makeTeaching();
    await service.updateLessonPlan('t', 'p1', { teacherId: 'x' }, teacherUser({ role: 'principal' }));
    expect(lessonPlanModel.findOneAndUpdate.mock.calls[0][1]).toEqual({ $set: { teacherId: 'x' } });
    expect(staffModel.findOne).not.toHaveBeenCalled();
  });
});

describe('TeachingService lesson plans: teacher cannot self-approve', () => {
  const forbiddenStatuses = ['approved', 'rejected', 'overdue'];

  it.each(forbiddenStatuses)('create with status %s -> 403 and nothing is created', async (status) => {
    const { service, lessonPlanModel } = makeTeaching();
    await expect(service.createLessonPlan('t', oid().toString(), { status }, teacherUser())).rejects.toBeInstanceOf(ForbiddenException);
    expect(lessonPlanModel.create).not.toHaveBeenCalled();
  });

  it.each(forbiddenStatuses)('update to status %s -> 403 and nothing is written', async (status) => {
    const { service, lessonPlanModel } = makeTeaching({ existingPlan: { teacherId: me.staffId } });
    await expect(service.updateLessonPlan('t', 'p1', { status }, teacherUser())).rejects.toBeInstanceOf(ForbiddenException);
    expect(lessonPlanModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it.each(['draft', 'submitted'])('create/update with status %s is allowed', async (status) => {
    const c = makeTeaching();
    await c.service.createLessonPlan('t', oid().toString(), { status }, teacherUser());
    expect(c.lessonPlanModel.create.mock.calls[0][0].status).toBe(status);
    const u = makeTeaching({ existingPlan: { teacherId: me.staffId } });
    await u.service.updateLessonPlan('t', 'p1', { status }, teacherUser());
    expect(u.lessonPlanModel.findOneAndUpdate.mock.calls[0][1].$set.status).toBe(status);
  });

  it('approver-owned fields are stripped on create and update (even with a valid status)', async () => {
    const c = makeTeaching();
    await c.service.createLessonPlan('t', oid().toString(),
      { status: 'submitted', approvedBy: oid().toString(), approvedAt: new Date(), approverNotes: 'ok', rejectionReason: 'x' }, teacherUser());
    const created = c.lessonPlanModel.create.mock.calls[0][0];
    for (const k of ['approvedBy', 'approvedAt', 'approverNotes', 'rejectionReason']) expect(created[k]).toBeUndefined();

    const u = makeTeaching({ existingPlan: { teacherId: me.staffId } });
    await u.service.updateLessonPlan('t', 'p1',
      { topic: 'x', approvedBy: oid().toString(), approvedAt: new Date(), approverNotes: 'ok', rejectionReason: 'x' }, teacherUser());
    const set = u.lessonPlanModel.findOneAndUpdate.mock.calls[0][1].$set;
    expect(set.topic).toBe('x');
    for (const k of ['approvedBy', 'approvedAt', 'approverNotes', 'rejectionReason']) expect(set[k]).toBeUndefined();
  });

  it('principal can still set any status and approver fields (unchanged)', async () => {
    const { service, lessonPlanModel } = makeTeaching();
    await service.updateLessonPlan('t', 'p1', { status: 'approved', approverNotes: 'good' }, teacherUser({ role: 'principal' }));
    expect(lessonPlanModel.findOneAndUpdate.mock.calls[0][1]).toEqual({ $set: { status: 'approved', approverNotes: 'good' } });
    await service.createLessonPlan('t', oid().toString(), { status: 'approved' }, teacherUser({ role: 'principal' }));
    expect(lessonPlanModel.create.mock.calls[0][0].status).toBe('approved');
  });
});

describe('PTMService: teacher identity', () => {
  function makePtm(meeting: any = null) {
    const staffModel: any = {
      findOne: jest.fn(() => chain({ _id: me.staffId })),
      findById: jest.fn(() => chain({ _id: me.staffId, firstName: 'Ms', lastName: 'Me' })),
    };
    const teacherProfileModel: any = { findOne: jest.fn(() => chain({ _id: me.profileId })) };
    const saved: any[] = [];
    const ptmModel: any = jest.fn(function (this: any, doc: any) { Object.assign(this, doc); this.save = async () => { saved.push(doc); return this; }; });
    ptmModel.findOne = jest.fn(() => ({ ...chain(meeting), then: undefined }));
    const studentModel: any = { findById: jest.fn(() => chain({ firstName: 'S', guardians: [] })) };
    const service = new PTMService(ptmModel, studentModel, staffModel, { } as any, undefined, teacherProfileModel);
    return { service, saved, ptmModel };
  }
  const dto = { studentId: oid().toString(), scheduledDate: '2026-01-01' };

  it('create: spoofed teacherId -> 403; own profile id normalised to Staff id', async () => {
    const a = makePtm();
    await expect(a.service.createMeeting('t', 'i', { ...dto, teacherId: oid().toString() }, 'Ms Me', me.userId, teacherUser())).rejects.toBeInstanceOf(ForbiddenException);
    const b = makePtm();
    await b.service.createMeeting('t', oid().toString(), { ...dto, teacherId: me.profileId.toString() }, 'Ms Me', me.userId, teacherUser()).catch(() => undefined);
    expect(String(b.saved[0]?.teacherId)).toBe(me.staffId.toString());
  });

  it('reschedule / outcome on another teacher\'s meeting -> 403', async () => {
    const { service } = makePtm({ teacherId: oid() });
    await expect(service.reschedule('m1', 't', { scheduledDate: '2026-02-01' }, teacherUser())).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.recordOutcome('m1', 't', { parentAttended: true }, teacherUser())).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('BehaviourController createRecord / updateRecord: teacher authorship', () => {
  function make() {
    const service: any = { createRecord: jest.fn(async (b: any) => b), updateRecord: jest.fn(async () => ({})) };
    return { ctrl: new BehaviourController(service), service };
  }
  const req = (user: any) => ({ user, headers: {} });

  it('teacher: reportedBy overridden from token, reportedById set server-side', async () => {
    const { ctrl, service } = make();
    await ctrl.createRecord({ studentId: 's', reportedBy: 'Someone Else' }, req(teacherUser()));
    const b = service.createRecord.mock.calls[0][0];
    expect(b.reportedBy).toBe('Ms Me');
    expect(b.reportedById).toBe(me.userId);
  });

  it('teacher: matching reportedById accepted; spoofed reportedById -> 403', async () => {
    const { ctrl, service } = make();
    await ctrl.createRecord({ reportedById: me.userId }, req(teacherUser()));
    expect(service.createRecord).toHaveBeenCalledTimes(1);
    await expect(ctrl.createRecord({ reportedById: oid().toString() }, req(teacherUser()))).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.createRecord).toHaveBeenCalledTimes(1);
  });

  it('non-teacher unchanged: body reportedBy / reportedById honoured', async () => {
    const { ctrl, service } = make();
    const other = oid().toString();
    await ctrl.createRecord({ reportedBy: 'Counsellor X', reportedById: other }, req(teacherUser({ role: 'principal' })));
    const b = service.createRecord.mock.calls[0][0];
    expect(b.reportedBy).toBe('Counsellor X');
    expect(b.reportedById).toBe(other);
  });

  it('PUT: teacher cannot re-attribute; principal can', async () => {
    const { ctrl, service } = make();
    await ctrl.updateRecord('r1', { title: 'x', reportedBy: 'Z', reportedById: 'z' }, req(teacherUser()));
    expect(service.updateRecord.mock.calls[0][2]).toEqual({ title: 'x' });
    await ctrl.updateRecord('r1', { reportedBy: 'Z' }, req(teacherUser({ role: 'principal' })));
    expect(service.updateRecord.mock.calls[1][2]).toEqual({ reportedBy: 'Z' });
  });
});
