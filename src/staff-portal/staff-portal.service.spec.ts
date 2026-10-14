import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { StaffPortalService } from './staff-portal.service';

// Hand-rolled model fakes (same lightweight approach as the other
// service-level specs in this repo). These tests pin the ownership and
// class-scoping rules that the Teacher app relies on, since the app only
// hides UI - the server is the real boundary.

const oid = () => new Types.ObjectId();
const lean = (v: any) => ({ lean: () => Promise.resolve(v), select() { return this; } });
const chain = (v: any) => ({ select() { return this; }, sort() { return this; }, limit() { return this; }, lean: () => Promise.resolve(v) });

function setup(opts: {
  staff?: any; profile?: any; profileClassTeacher?: any; student?: any; guardian?: any;
  thread?: any; leave?: any;
} = {}) {
  const user = { userId: oid().toString(), tenantId: oid().toString(), schoolSlug: 'demo', name: 'Ms Teacher', role: 'teacher' };
  const staff = opts.staff === undefined ? { _id: oid(), firstName: 'T', lastName: 'T' } : opts.staff;

  const staffModel: any = { findOne: jest.fn().mockResolvedValue(staff) };
  const profileModel: any = {
    findOne: jest.fn((q: any) => (q.isClassTeacher ? lean(opts.profileClassTeacher ?? null) : lean(opts.profile ?? null))),
  };
  const studentModel: any = {
    findOne: jest.fn(() => lean(opts.student ?? null)),
    find: jest.fn(() => chain(opts.student ? [opts.student] : [])),
  };
  const userModel: any = { findOne: jest.fn(() => lean(opts.guardian ?? null)), find: jest.fn(() => chain([])) };
  const threadDoc = opts.thread && { ...opts.thread, save: jest.fn().mockResolvedValue(undefined), toObject() { return this; } };
  const threadModel: any = {
    findOne: jest.fn().mockResolvedValue(threadDoc ?? null),
    create: jest.fn((d: any) => Promise.resolve({ ...d, _id: oid(), toObject() { return this; } })),
  };
  const messageModel: any = { create: jest.fn((d: any) => Promise.resolve({ ...d, toObject() { return d; } })) };
  const leaveDoc = opts.leave && { ...opts.leave, save: jest.fn().mockResolvedValue(undefined), toObject() { return this; } };
  const studentLeaveModel: any = { findOne: jest.fn().mockResolvedValue(leaveDoc ?? null) };
  const deletionModel: any = {
    findOne: jest.fn(() => lean(null)),
    create: jest.fn((d: any) => Promise.resolve({ ...d, _id: oid() })),
  };
  const notifier: any = { notify: jest.fn().mockResolvedValue(undefined) };
  const noop: any = {};

  const service = new StaffPortalService(
    userModel, noop /*tenant*/, staffModel, noop /*campus*/, profileModel, studentModel,
    studentLeaveModel, noop /*notification*/, threadModel, messageModel, noop /*deviceToken*/, deletionModel,
    noop /*roles*/, notifier,
  );
  return { service, user, studentModel, studentLeaveModel, notifier, threadModel, messageModel, threadDoc, leaveDoc, deletionModel };
}

describe('StaffPortalService', () => {
  it('rejects accounts with no linked staff record', async () => {
    const { service, user } = setup({ staff: null });
    await expect(service.listThreads(user as any, {})).rejects.toThrow(ForbiddenException);
  });

  describe('messaging', () => {
    it('404s when the thread is not the caller\'s (query is scoped by staffId)', async () => {
      const { service, user, threadModel } = setup();
      await expect(service.sendMessage(user as any, oid().toString(), { body: 'hi' })).rejects.toThrow(NotFoundException);
      expect(threadModel.findOne.mock.calls[0][0]).toHaveProperty('staffId');
      expect(threadModel.findOne.mock.calls[0][0]).toHaveProperty('schoolSlug', 'demo');
    });

    it('refuses to post into a closed thread', async () => {
      const { service, user } = setup({ thread: { status: 'closed', schoolSlug: 'demo' } });
      await expect(service.sendMessage(user as any, oid().toString(), { body: 'hi' })).rejects.toThrow(ConflictException);
    });

    it('reply flags the guardian unread and notifies them', async () => {
      const guardianUserId = oid();
      const { service, user, notifier, messageModel, threadDoc } = setup({
        thread: { status: 'open', schoolSlug: 'demo', guardianUserId, staffName: 'Ms T' },
      });
      await service.sendMessage(user as any, oid().toString(), { body: 'Hello parent' });
      expect(messageModel.create).toHaveBeenCalledWith(expect.objectContaining({ senderRole: 'staff', body: 'Hello parent' }));
      expect(threadDoc.guardianHasUnread).toBe(true);
      expect(threadDoc.staffHasUnread).toBe(false);
      expect(notifier.notify).toHaveBeenCalledWith(expect.objectContaining({ recipientUserId: guardianUserId, type: 'message' }));
    });

    it('cannot start a thread about a student the teacher does not teach', async () => {
      const { service, user, threadModel } = setup({
        profile: { currentAssignments: [{ gradeLevel: '5', sectionName: 'A' }] },
        student: { _id: oid(), currentGrade: '7', currentSection: 'B' },
      });
      await expect(service.createThread(user as any, {
        studentId: oid().toString(), guardianUserId: oid().toString(), subject: 's', firstMessage: 'm',
      })).rejects.toThrow(ForbiddenException);
      expect(threadModel.create).not.toHaveBeenCalled();
    });

    it('cannot message a user who is not a guardian of that student', async () => {
      const { service, user, threadModel } = setup({
        profile: { currentAssignments: [{ gradeLevel: '5', sectionName: 'A' }] },
        student: { _id: oid(), currentGrade: '5', currentSection: 'A' },
        guardian: null,
      });
      await expect(service.createThread(user as any, {
        studentId: oid().toString(), guardianUserId: oid().toString(), subject: 's', firstMessage: 'm',
      })).rejects.toThrow(ForbiddenException);
      expect(threadModel.create).not.toHaveBeenCalled();
    });
  });

  describe('student leave review', () => {
    const gradeSection = { classTeacherOfGradeName: '5', classTeacherOfSectionName: 'A' };

    it('is class-teacher only', async () => {
      const { service, user } = setup({ profileClassTeacher: null });
      await expect(service.listStudentLeaves(user as any, {})).rejects.toThrow(ForbiddenException);
      await expect(service.reviewStudentLeave(user as any, oid().toString(), { status: 'approved' })).rejects.toThrow(ForbiddenException);
    });

    it('blocks reviewing a leave of a student outside the class', async () => {
      const { service, user, leaveDoc } = setup({
        profileClassTeacher: gradeSection,
        student: { currentGrade: '6', currentSection: 'A' },
        leave: { status: 'pending', studentId: oid(), studentName: 'S', requestedByUserId: oid() },
      });
      await expect(service.reviewStudentLeave(user as any, oid().toString(), { status: 'approved' })).rejects.toThrow(ForbiddenException);
      expect(leaveDoc.save).not.toHaveBeenCalled();
    });

    it('matches tolerant grade/section formats and rejects look-alikes', async () => {
      const mk = (g: string, sec: string) => setup({
        profileClassTeacher: { classTeacherOfGradeName: 'Grade 5', classTeacherOfSectionName: 'A' },
        student: { currentGrade: g, currentSection: sec },
        leave: { status: 'pending', studentId: oid(), studentName: 'S', requestedByUserId: oid() },
      });
      let t = mk('5', ' a ');
      await expect(t.service.reviewStudentLeave(t.user as any, oid().toString(), { status: 'approved' })).resolves.toBeDefined();
      t = mk('15', 'A');
      await expect(t.service.reviewStudentLeave(t.user as any, oid().toString(), { status: 'approved' })).rejects.toThrow(ForbiddenException);
    });

    it('listStudentLeaves filters students in memory with tolerant matching', async () => {
      const inClass = oid();
      const t = setup({ profileClassTeacher: { classTeacherOfGradeName: 'Grade 5', classTeacherOfSectionName: 'A' } });
      (t.studentModel.find as jest.Mock).mockImplementation(() => chain([
        { _id: inClass, currentGrade: '5', currentSection: ' a ' },
        { _id: oid(), currentGrade: '15', currentSection: 'A' },
      ]));
      t.studentLeaveModel.find = jest.fn(() => chain([]));
      await t.service.listStudentLeaves(t.user as any, {});
      const q = t.studentLeaveModel.find.mock.calls[0][0];
      expect(q.studentId.$in).toEqual([inClass]);
    });

    it('refuses to re-decide an already decided request', async () => {
      const { service, user } = setup({
        profileClassTeacher: gradeSection,
        student: { currentGrade: '5', currentSection: 'A' },
        leave: { status: 'approved', studentId: oid(), studentName: 'S', requestedByUserId: oid() },
      });
      await expect(service.reviewStudentLeave(user as any, oid().toString(), { status: 'rejected' })).rejects.toThrow(ConflictException);
    });

    it('approves, records approver and notifies the requesting guardian', async () => {
      const requestedByUserId = oid();
      const { service, user, notifier, leaveDoc } = setup({
        profileClassTeacher: gradeSection,
        student: { currentGrade: '5', currentSection: 'A' },
        leave: { status: 'pending', studentId: oid(), studentName: 'Sam', requestedByUserId },
      });
      await service.reviewStudentLeave(user as any, oid().toString(), { status: 'approved', remarks: 'Get well' });
      expect(leaveDoc.status).toBe('approved');
      expect(leaveDoc.approverNote).toBe('Get well');
      expect(notifier.notify).toHaveBeenCalledWith(expect.objectContaining({ recipientUserId: requestedByUserId, type: 'leave_decision' }));
    });
  });

  describe('account deletion request', () => {
    it('requires explicit confirmation', async () => {
      const { service, user, deletionModel } = setup();
      await expect(service.requestAccountDeletion(user as any, { confirm: false })).rejects.toThrow();
      expect(deletionModel.create).not.toHaveBeenCalled();
    });

    it('creates a request (never deletes) when confirmed', async () => {
      const { service, user, deletionModel } = setup();
      const r: any = await service.requestAccountDeletion(user as any, { confirm: true, reason: 'leaving' });
      expect(deletionModel.create).toHaveBeenCalled();
      expect(r.status).toBe('pending');
    });
  });
});
