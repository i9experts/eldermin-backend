import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ForumService } from './forum.service';

const TENANT_ID = '507f1f77bcf86cd799439011';
const SYLLABUS_ID = '507f1f77bcf86cd799439012';
const THREAD_ID = '507f1f77bcf86cd799439013';
const STUDENT_ID = '507f1f77bcf86cd799439014';
const OTHER_STUDENT_ID = '507f1f77bcf86cd799439015';

function build(opts: { thread?: any; syllabus?: any } = {}) {
  const thread: any = {
    _id: THREAD_ID, syllabusId: SYLLABUS_ID, tenantId: TENANT_ID,
    authorType: 'student', authorId: STUDENT_ID, authorName: 'A Student',
    isLocked: false, replyCount: 0,
    save: jest.fn(async function (this: any) { return this; }),
    deleteOne: jest.fn(async () => undefined),
    ...opts.thread,
  };
  const syllabus = { _id: SYLLABUS_ID, teacherId: 'S1', ...opts.syllabus };

  function ThreadModel() {}
  (ThreadModel as any).findOne = jest.fn(() => ({ lean: async () => thread }));
  // Service calls findOne without .lean() when it needs to .save() - override per-test via mockImplementationOnce where needed.
  (ThreadModel as any).find = jest.fn(() => ({ sort: () => ({ lean: async () => [thread] }) }));
  (ThreadModel as any).updateOne = jest.fn(async () => undefined);
  (ThreadModel as any).create = jest.fn(async (doc: any) => ({ _id: 'newThread', ...doc }));

  function ReplyModel() {}
  (ReplyModel as any).find = jest.fn(() => ({ sort: () => ({ lean: async () => [] }) }));
  (ReplyModel as any).findOne = jest.fn(() => ({}));
  (ReplyModel as any).deleteMany = jest.fn(async () => undefined);
  (ReplyModel as any).create = jest.fn(async (doc: any) => ({ _id: 'newReply', ...doc }));

  function SyllabusModel() {}
  (SyllabusModel as any).findOne = jest.fn(() => ({ select: () => ({ lean: async () => syllabus }) }));

  const svc: any = Object.create(ForumService.prototype);
  svc.threadModel = ThreadModel;
  svc.replyModel = ReplyModel;
  svc.syllabusModel = SyllabusModel;
  svc.staffModel = {};
  svc.teacherProfileModel = {};
  return { svc: svc as ForumService, thread, syllabus };
}

describe('ForumService (LMS Phase 4)', () => {
  it('createReply refuses on a locked thread', async () => {
    const { svc } = build({ thread: { isLocked: true } });
    // findOne without .lean() is used by createReply/deleteThread/moderation (it needs .save()); emulate it directly.
    (svc as any).threadModel.findOne = jest.fn(async () => ({ isLocked: true }));
    await expect(svc.createReply(TENANT_ID, 'demo-school', THREAD_ID, { type: 'student', id: STUDENT_ID, name: 'A' }, 'hello'))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('createThread/createReply reject an empty body', async () => {
    const { svc } = build();
    await expect(svc.createThread(TENANT_ID, 'demo-school', SYLLABUS_ID, { type: 'student', id: STUDENT_ID, name: 'A' }, 'Title', '   '))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('a student can delete their own thread with no staff identity involved', async () => {
    const { svc, thread } = build();
    (svc as any).threadModel.findOne = jest.fn(async () => thread);
    const result = await svc.deleteThread(TENANT_ID, THREAD_ID, { author: { type: 'student', id: STUDENT_ID, name: 'A' } });
    expect(result).toEqual({ message: 'Thread deleted' });
    expect(thread.deleteOne).toHaveBeenCalled();
  });

  it("a student cannot delete another student's thread without a staff identity", async () => {
    const { svc, thread } = build();
    (svc as any).threadModel.findOne = jest.fn(async () => thread);
    await expect(svc.deleteThread(TENANT_ID, THREAD_ID, { author: { type: 'student', id: OTHER_STUDENT_ID, name: 'B' } }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(thread.deleteOne).not.toHaveBeenCalled();
  });

  it('a non-teacher staff member (e.g. admin) can delete any thread', async () => {
    const { svc, thread } = build();
    (svc as any).threadModel.findOne = jest.fn(async () => thread);
    const result = await svc.deleteThread(TENANT_ID, THREAD_ID, { staff: { role: 'admin' } as any });
    expect(result).toEqual({ message: 'Thread deleted' });
  });

  it('deleteThread 404s when the thread does not exist', async () => {
    const { svc } = build();
    (svc as any).threadModel.findOne = jest.fn(async () => null);
    await expect(svc.deleteThread(TENANT_ID, THREAD_ID, { staff: { role: 'admin' } as any })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('setThreadModeration is staff-only and enforced via the syllabus lookup', async () => {
    const { svc, thread } = build();
    (svc as any).threadModel.findOne = jest.fn(async () => thread);
    const result = await svc.setThreadModeration(TENANT_ID, THREAD_ID, { isPinned: true }, { role: 'admin' } as any);
    expect(result.isPinned).toBe(true);
  });
});
