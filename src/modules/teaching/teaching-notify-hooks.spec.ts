import { Types } from 'mongoose';
import { TeachingService } from './teaching.service';
import { SubstitutionService } from './substitution.service';
import { PTMService } from './ptm.service';

// Unit tests for the staff-portal notification hooks. Hand-rolled fakes,
// positional construction (same approach as teaching.service.spec.ts).

const TENANT = new Types.ObjectId().toString();
const USER_ID = new Types.ObjectId();
const lean = (v: any) => ({ select: () => ({ lean: () => Promise.resolve(v) }), lean: () => Promise.resolve(v) });
const db = (slug: string | null) => ({
  collection: () => ({ findOne: jest.fn().mockResolvedValue(slug ? { slug } : null) }),
});

// ───────────────────────────── Lesson plan ─────────────────────────────
describe('TeachingService lesson plan notify hooks', () => {
  const teacherId = new Types.ObjectId();
  const planId = new Types.ObjectId();
  const plan = { _id: planId, teacherId, title: 'Fractions' };

  function make(opts: { updated?: any; notify?: jest.Mock | null; staff?: any; slug?: string | null; profile?: any } = {}) {
    const updated = 'updated' in opts ? opts.updated : plan;
    const lessonPlanModel: any = { findOneAndUpdate: jest.fn().mockReturnValue({ lean: () => Promise.resolve(updated) }) };
    const staffModel: any = {
      db: db('slug' in opts ? opts.slug! : 'demo'),
      findById: jest.fn().mockReturnValue(lean('staff' in opts ? opts.staff : { userId: USER_ID })),
    };
    const teacherProfileModel: any = { findById: jest.fn().mockReturnValue(lean(opts.profile ?? null)) };
    const notify = opts.notify === undefined ? jest.fn().mockResolvedValue(undefined) : opts.notify;
    const noop: any = {};
    const service = new (TeachingService as any)(
      teacherProfileModel, lessonPlanModel, noop, noop, noop, noop, noop, noop, noop, noop,
      staffModel, noop, noop, noop, noop,
      notify ? { notify } : undefined,
    ) as TeachingService;
    return { service, notify, staffModel, teacherProfileModel };
  }
  const uid = new Types.ObjectId().toString();

  it('approve notifies the author once with correct payload', async () => {
    const { service, notify } = make();
    const r = await service.approveLessonPlan(TENANT, planId.toString(), uid, 'Nice work');
    expect(r).toBe(plan);
    expect(notify).toHaveBeenCalledTimes(1);
    const arg = (notify as jest.Mock).mock.calls[0][0];
    expect(arg).toMatchObject({ recipientUserId: USER_ID, schoolSlug: 'demo', type: 'lesson_plan', title: 'Lesson plan approved', relatedEntityId: String(planId) });
    expect(arg.body).toContain('Fractions');
    expect(arg.body).toContain('Nice work');
  });

  it('reject notifies the author once with the reason', async () => {
    const { service, notify } = make();
    const r = await service.rejectLessonPlan(TENANT, planId.toString(), 'Missing objectives');
    expect(r).toBe(plan);
    expect(notify).toHaveBeenCalledTimes(1);
    const arg = (notify as jest.Mock).mock.calls[0][0];
    expect(arg).toMatchObject({ recipientUserId: USER_ID, schoolSlug: 'demo', type: 'lesson_plan', title: 'Lesson plan rejected', relatedEntityId: String(planId) });
    expect(arg.body).toContain('Missing objectives');
  });

  it('truncates a long reason', async () => {
    const { service, notify } = make();
    await service.rejectLessonPlan(TENANT, planId.toString(), 'x'.repeat(500));
    expect((notify as jest.Mock).mock.calls[0][0].body.length).toBeLessThan(250);
  });

  it('falls back to TeacherProfile.staffId when teacherId is a profile id', async () => {
    const profileStaffId = new Types.ObjectId();
    const { service, notify, staffModel } = make({ profile: { staffId: profileStaffId } });
    staffModel.findById
      .mockReturnValueOnce(lean(null))
      .mockReturnValueOnce(lean({ userId: USER_ID }));
    await service.approveLessonPlan(TENANT, planId.toString(), uid, '');
    expect(staffModel.findById).toHaveBeenLastCalledWith(profileStaffId);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['approve', (s: TeachingService) => s.approveLessonPlan(TENANT, planId.toString(), uid, 'n')],
    ['reject', (s: TeachingService) => s.rejectLessonPlan(TENANT, planId.toString(), 'r')],
  ])('%s: notifier throwing does not change the result', async (_n, act) => {
    const { service, notify } = make({ notify: jest.fn().mockRejectedValue(new Error('boom')) });
    await expect(act(service)).resolves.toBe(plan);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['approve', (s: TeachingService) => s.approveLessonPlan(TENANT, planId.toString(), uid, 'n')],
    ['reject', (s: TeachingService) => s.rejectLessonPlan(TENANT, planId.toString(), 'r')],
  ])('%s: no notify when slug, userId unresolved; result unchanged', async (_n, act) => {
    const a = make({ slug: null });
    await expect(act(a.service)).resolves.toBe(plan);
    expect(a.notify).not.toHaveBeenCalled();
    const b = make({ staff: { userId: null } });
    await expect(act(b.service)).resolves.toBe(plan);
    expect(b.notify).not.toHaveBeenCalled();
  });

  it.each([
    ['approve', (s: TeachingService) => s.approveLessonPlan(TENANT, planId.toString(), uid, 'n')],
    ['reject', (s: TeachingService) => s.rejectLessonPlan(TENANT, planId.toString(), 'r')],
  ])('%s: no notify when update returns null', async (_n, act) => {
    const { service, notify } = make({ updated: null });
    await expect(act(service)).resolves.toBeNull();
    expect(notify).not.toHaveBeenCalled();
  });

  it('works without a notifier', async () => {
    const { service } = make({ notify: null });
    await expect(service.approveLessonPlan(TENANT, planId.toString(), uid, 'n')).resolves.toBe(plan);
    await expect(service.rejectLessonPlan(TENANT, planId.toString(), 'r')).resolves.toBe(plan);
  });
});

// ───────────────────────────── Substitution ─────────────────────────────
describe('SubstitutionService.assignSubstitute notify hook', () => {
  const subId = new Types.ObjectId();
  const staffId = new Types.ObjectId().toString();

  function make(opts: { notify?: jest.Mock | null; staff?: any; slug?: string | null; fixture?: any } = {}) {
    const fixture: any = 'fixture' in opts ? opts.fixture : {
      _id: subId, status: 'open', dayOfWeek: 1, periodNo: 2, date: new Date('2026-10-05'),
      gradeLevel: '5', sectionName: 'A', originalTeacherName: 'Mr. Orig', startTime: '08:00', endTime: '08:40',
      save: jest.fn().mockResolvedValue(undefined),
    };
    const substitutionModel: any = {
      findOne: jest.fn().mockResolvedValue(fixture),
      find: jest.fn().mockReturnValue({ lean: () => Promise.resolve([]) }),
    };
    const timetableModel: any = { find: jest.fn().mockReturnValue({ lean: () => Promise.resolve([]) }) };
    const staffModel: any = {
      db: db('slug' in opts ? opts.slug! : 'demo'),
      findById: jest.fn().mockReturnValue({ lean: () => Promise.resolve('staff' in opts ? opts.staff : { firstName: 'Sam', lastName: 'Sub', userId: USER_ID }) }),
    };
    const emailService: any = { sendEmail: jest.fn().mockResolvedValue({ sent: true }) };
    const notify = opts.notify === undefined ? jest.fn().mockResolvedValue(undefined) : opts.notify;
    const service = new (SubstitutionService as any)(
      substitutionModel, timetableModel, {}, staffModel, emailService, notify ? { notify } : undefined,
    ) as SubstitutionService;
    return { service, notify, fixture };
  }

  it('notifies the substitute once with correct payload', async () => {
    const { service, notify, fixture } = make();
    const r = await service.assignSubstitute(String(subId), TENANT, staffId, 'admin');
    expect(r).toBe(fixture);
    expect(fixture.status).toBe('assigned');
    expect(notify).toHaveBeenCalledTimes(1);
    const arg = (notify as jest.Mock).mock.calls[0][0];
    expect(arg).toMatchObject({ recipientUserId: USER_ID, schoolSlug: 'demo', type: 'substitution', title: 'Substitution assigned', relatedEntityId: String(subId) });
    expect(arg.body).toContain('Mr. Orig');
    expect(arg.body).toContain('Period 2');
  });

  it('notifier throwing does not change the result', async () => {
    const { service, fixture } = make({ notify: jest.fn().mockRejectedValue(new Error('boom')) });
    await expect(service.assignSubstitute(String(subId), TENANT, staffId, 'admin')).resolves.toBe(fixture);
  });

  it('no notify when slug or userId cannot be resolved', async () => {
    const a = make({ slug: null });
    await expect(a.service.assignSubstitute(String(subId), TENANT, staffId, 'admin')).resolves.toBe(a.fixture);
    expect(a.notify).not.toHaveBeenCalled();
    const b = make({ staff: { firstName: 'S', userId: null } });
    await b.service.assignSubstitute(String(subId), TENANT, staffId, 'admin');
    expect(b.notify).not.toHaveBeenCalled();
  });

  it('no notify when assignment fails (fixture missing / not open / staff missing)', async () => {
    const a = make({ fixture: null });
    await expect(a.service.assignSubstitute(String(subId), TENANT, staffId, 'admin')).rejects.toThrow();
    const b = make({ fixture: { status: 'assigned' } });
    await expect(b.service.assignSubstitute(String(subId), TENANT, staffId, 'admin')).rejects.toThrow();
    const c = make({ staff: null });
    await expect(c.service.assignSubstitute(String(subId), TENANT, staffId, 'admin')).rejects.toThrow();
    expect(a.notify).not.toHaveBeenCalled();
    expect(b.notify).not.toHaveBeenCalled();
    expect(c.notify).not.toHaveBeenCalled();
  });

  it('works without a notifier', async () => {
    const { service, fixture } = make({ notify: null });
    await expect(service.assignSubstitute(String(subId), TENANT, staffId, 'admin')).resolves.toBe(fixture);
  });
});

// ───────────────────────────── PTM ─────────────────────────────
describe('PTMService notify hooks', () => {
  const meetingId = new Types.ObjectId();
  const teacherId = new Types.ObjectId().toString();
  const studentId = new Types.ObjectId().toString();

  function make(opts: { notify?: jest.Mock | null; teacherStaff?: any; slug?: string | null; rescheduled?: any } = {}) {
    class FakeMeeting {
      _id = meetingId; discussionPoints: any[] = []; save = jest.fn().mockResolvedValue(undefined);
      [k: string]: any;
      constructor(d: any) { Object.assign(this, d); }
    }
    const resched = 'rescheduled' in opts ? opts.rescheduled : { _id: meetingId, teacherId, studentName: 'Kid K', scheduledDate: new Date('2026-11-01'), startTime: '10:00', endTime: '10:20' };
    const ptmModel: any = FakeMeeting;
    ptmModel.findOneAndUpdate = jest.fn().mockResolvedValue(resched);
    const studentModel: any = { findById: jest.fn().mockReturnValue({ lean: () => Promise.resolve({ firstName: 'Kid', lastName: 'K', guardians: [] }) }) };
    const teacherStaff = 'teacherStaff' in opts ? opts.teacherStaff : { firstName: 'Tea', lastName: 'Cher', userId: USER_ID };
    const staffModel: any = {
      db: db('slug' in opts ? opts.slug! : 'demo'),
      findById: jest.fn().mockImplementation(() => ({
        lean: () => Promise.resolve(teacherStaff),
        select: () => ({ lean: () => Promise.resolve(teacherStaff) }),
      })),
    };
    const emailService: any = { sendEmail: jest.fn().mockResolvedValue({ sent: true }) };
    const notify = opts.notify === undefined ? jest.fn().mockResolvedValue(undefined) : opts.notify;
    const service = new (PTMService as any)(ptmModel, studentModel, staffModel, emailService, notify ? { notify } : undefined) as PTMService;
    return { service, notify, resched };
  }
  const data = () => ({ studentId, teacherId, scheduledDate: '2026-11-01', startTime: '10:00', endTime: '10:20' });

  it('createMeeting notifies the teacher once with correct payload', async () => {
    const { service, notify } = make();
    const m: any = await service.createMeeting(TENANT, 'inst', data(), 'some-admin-id');
    expect(notify).toHaveBeenCalledTimes(1);
    const arg = (notify as jest.Mock).mock.calls[0][0];
    expect(arg).toMatchObject({ recipientUserId: USER_ID, schoolSlug: 'demo', type: 'ptm', title: 'Parent-teacher meeting scheduled', relatedEntityId: String(meetingId) });
    expect(arg.body).toContain('Kid K');
    expect(m.studentName).toBe('Kid K');
  });

  it('createMeeting does not notify when requested by the teacher themself', async () => {
    const { service, notify } = make();
    await service.createMeeting(TENANT, 'inst', data(), String(USER_ID));
    expect(notify).not.toHaveBeenCalled();
  });

  it('createMeeting survives notifier failure and unresolved recipient/slug', async () => {
    const a = make({ notify: jest.fn().mockRejectedValue(new Error('boom')) });
    await expect(a.service.createMeeting(TENANT, 'inst', data(), 'x')).resolves.toMatchObject({ studentName: 'Kid K' });
    const b = make({ slug: null });
    await expect(b.service.createMeeting(TENANT, 'inst', data(), 'x')).resolves.toBeDefined();
    expect(b.notify).not.toHaveBeenCalled();
    const c = make({ teacherStaff: { firstName: 'T', userId: null } });
    await c.service.createMeeting(TENANT, 'inst', data(), 'x');
    expect(c.notify).not.toHaveBeenCalled();
  });

  it('createMeeting does not notify when the student is missing', async () => {
    const { service, notify } = make();
    (service as any).studentModel.findById.mockReturnValue({ lean: () => Promise.resolve(null) });
    await expect(service.createMeeting(TENANT, 'inst', data(), 'x')).rejects.toThrow();
    expect(notify).not.toHaveBeenCalled();
  });

  it('createMeeting works without a notifier', async () => {
    const { service } = make({ notify: null });
    await expect(service.createMeeting(TENANT, 'inst', data(), 'x')).resolves.toMatchObject({ studentName: 'Kid K' });
  });

  it('reschedule notifies the teacher once with correct payload', async () => {
    const { service, notify, resched } = make();
    const r = await service.reschedule(String(meetingId), TENANT, { scheduledDate: '2026-11-01', startTime: '10:00' });
    expect(r).toBe(resched);
    expect(notify).toHaveBeenCalledTimes(1);
    expect((notify as jest.Mock).mock.calls[0][0]).toMatchObject({
      recipientUserId: USER_ID, schoolSlug: 'demo', type: 'ptm', title: 'Parent-teacher meeting rescheduled', relatedEntityId: String(meetingId),
    });
  });

  it('reschedule survives notifier failure / unresolved slug and returns the same doc', async () => {
    const a = make({ notify: jest.fn().mockRejectedValue(new Error('boom')) });
    await expect(a.service.reschedule(String(meetingId), TENANT, { scheduledDate: '2026-11-01' })).resolves.toBe(a.resched);
    const b = make({ slug: null });
    await expect(b.service.reschedule(String(meetingId), TENANT, { scheduledDate: '2026-11-01' })).resolves.toBe(b.resched);
    expect(b.notify).not.toHaveBeenCalled();
  });

  it('reschedule does not notify when no meeting matched', async () => {
    const { service, notify } = make({ rescheduled: null });
    await expect(service.reschedule(String(meetingId), TENANT, { scheduledDate: '2026-11-01' })).rejects.toThrow();
    expect(notify).not.toHaveBeenCalled();
  });

  it('reschedule works without a notifier', async () => {
    const { service, resched } = make({ notify: null });
    await expect(service.reschedule(String(meetingId), TENANT, { scheduledDate: '2026-11-01' })).resolves.toBe(resched);
  });
});
