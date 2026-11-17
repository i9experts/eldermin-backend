import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ForumThread, ForumThreadDocument } from './schemas/forum-thread.schema';
import { ForumReply, ForumReplyDocument } from './schemas/forum-reply.schema';
import { Syllabus, SyllabusDocument } from './schemas/syllabus.schema';
import { Staff, StaffDocument } from '../modules/hr/schemas/staff.schema';
import { TeacherProfile, TeacherProfileDocument } from '../modules/teaching/schemas/teacher-profile.schema';
import { ScopedUser } from '../auth/scope.util';
import { isTeacherCaller, resolveTeacherIdentity, assertOwnsTeacherDoc } from '../staff-portal/teacher-identity.util';
import { sanitizeRichText } from '../common/utils/rich-text.util';
import { GamificationService } from '../gamification/gamification.service';

export interface ForumAuthor { type: 'staff' | 'student'; id: string; name: string; }

// ============================================================
// FORUM SERVICE — LMS Phase 4
// Deliberately caller-agnostic about WHO may reach these methods at all -
// that's enforced one layer up, by whichever controller calls in
// (SyllabusController for staff, ParentPortalController for a guardian
// acting on a student's behalf, which itself re-checks the same course-
// visibility rule everything else in the LMS already uses before ever
// calling here). What this service does own: a non-owner can delete
// their OWN post without staff involvement, but deleting someone else's
// post or moderating (pin/lock) always requires a real staff identity -
// never just "the caller isn't a teacher", which would otherwise also
// describe a parent/student caller with no rights at all.
// ============================================================
@Injectable()
export class ForumService {
  constructor(
    @InjectModel(ForumThread.name) private threadModel: Model<ForumThreadDocument>,
    @InjectModel(ForumReply.name) private replyModel: Model<ForumReplyDocument>,
    @InjectModel(Syllabus.name) private syllabusModel: Model<SyllabusDocument>,
    @InjectModel(Staff.name) private staffModel: Model<StaffDocument>,
    @InjectModel(TeacherProfile.name) private teacherProfileModel: Model<TeacherProfileDocument>,
    private gamificationService: GamificationService,
  ) {}

  private async getSyllabusOrThrow(syllabusId: string, tenantId: string) {
    const syllabus = await this.syllabusModel.findOne({ _id: syllabusId, tenantId }).select('teacherId').lean();
    if (!syllabus) throw new NotFoundException('Course not found');
    return syllabus;
  }

  /** Staff moderation rights only: the course's own teacher, or any other staff role (admin/principal/etc). */
  private async assertStaffCanModerate(syllabus: { teacherId?: any }, requestingUser: ScopedUser) {
    if (!isTeacherCaller(requestingUser)) return;
    const me = await resolveTeacherIdentity(this.staffModel, this.teacherProfileModel, requestingUser as any);
    assertOwnsTeacherDoc(me, syllabus.teacherId, "You can only moderate your own course's forum");
  }

  async listThreads(tenantId: string, syllabusId: string) {
    await this.getSyllabusOrThrow(syllabusId, tenantId);
    return this.threadModel.find({ tenantId, syllabusId }).sort({ isPinned: -1, lastReplyAt: -1, createdAt: -1 }).lean();
  }

  async getThread(tenantId: string, threadId: string) {
    const thread = await this.threadModel.findOne({ _id: threadId, tenantId }).lean();
    if (!thread) throw new NotFoundException('Thread not found');
    const replies = await this.replyModel.find({ threadId, tenantId }).sort({ createdAt: 1 }).lean();
    return { ...thread, replies };
  }

  async createThread(tenantId: string, schoolSlug: string, syllabusId: string, author: ForumAuthor, title: string, body: string) {
    await this.getSyllabusOrThrow(syllabusId, tenantId);
    if (!title?.trim()) throw new BadRequestException('A thread needs a title.');
    if (!body?.trim()) throw new BadRequestException('A thread needs a message.');
    const thread = await this.threadModel.create({
      tenantId, schoolSlug, syllabusId,
      title: title.trim(), body: sanitizeRichText(body),
      authorType: author.type, authorId: author.id, authorName: author.name,
    });
    if (author.type === 'student') await this.awardForumPost(schoolSlug, tenantId, author.id, 'thread', String(thread._id));
    return thread;
  }

  async createReply(tenantId: string, schoolSlug: string, threadId: string, author: ForumAuthor, body: string) {
    if (!body?.trim()) throw new BadRequestException('A reply needs a message.');
    const thread = await this.threadModel.findOne({ _id: threadId, tenantId });
    if (!thread) throw new NotFoundException('Thread not found');
    if (thread.isLocked) throw new BadRequestException('This thread is locked and no longer accepting replies.');
    const reply = await this.replyModel.create({
      tenantId, schoolSlug, threadId, syllabusId: thread.syllabusId,
      body: sanitizeRichText(body), authorType: author.type, authorId: author.id, authorName: author.name,
    });
    thread.replyCount = (thread.replyCount || 0) + 1;
    thread.lastReplyAt = new Date();
    await thread.save();
    if (author.type === 'student') await this.awardForumPost(schoolSlug, tenantId, author.id, 'reply', String(reply._id));
    return reply;
  }

  /** LMS Phase 5 (gamification) - small points + a one-time "forum_contributor" badge for a student's first-ever post. Never blocks the post itself from saving. */
  private async awardForumPost(schoolSlug: string, tenantId: string, studentId: string, kind: 'thread' | 'reply', sourceId: string) {
    try {
      await this.gamificationService.awardPoints(
        schoolSlug, studentId, 5, kind === 'thread' ? 'Started a forum discussion' : 'Replied in a forum discussion',
        'forum_post', `${kind}:${sourceId}`, { tenantId },
      );
      await this.gamificationService.awardBadge(schoolSlug, studentId, 'forum_contributor', { tenantId, sourceType: 'forum_post', sourceId: `${kind}:${sourceId}` });
    } catch { /* never let a gamification hiccup block the student's own post from saving */ }
  }

  /** Staff only - pin/unpin or lock/unlock a thread. */
  async setThreadModeration(tenantId: string, threadId: string, dto: { isPinned?: boolean; isLocked?: boolean }, requestingUser: ScopedUser) {
    const thread = await this.threadModel.findOne({ _id: threadId, tenantId });
    if (!thread) throw new NotFoundException('Thread not found');
    const syllabus = await this.getSyllabusOrThrow(String(thread.syllabusId), tenantId);
    await this.assertStaffCanModerate(syllabus, requestingUser);
    if (dto.isPinned !== undefined) thread.isPinned = dto.isPinned;
    if (dto.isLocked !== undefined) thread.isLocked = dto.isLocked;
    await thread.save();
    return thread;
  }

  /** `actor` is either the staff caller doing moderation, or the student/staff author deleting their own post - never both. */
  async deleteThread(tenantId: string, threadId: string, actor: { staff?: ScopedUser; author?: ForumAuthor }) {
    const thread = await this.threadModel.findOne({ _id: threadId, tenantId });
    if (!thread) throw new NotFoundException('Thread not found');
    const isOwnPost = actor.author && thread.authorType === actor.author.type && thread.authorId === actor.author.id;
    if (!isOwnPost) {
      if (!actor.staff) throw new ForbiddenException('You can only delete your own posts.');
      const syllabus = await this.getSyllabusOrThrow(String(thread.syllabusId), tenantId);
      await this.assertStaffCanModerate(syllabus, actor.staff);
    }
    await thread.deleteOne();
    await this.replyModel.deleteMany({ threadId });
    return { message: 'Thread deleted' };
  }

  async deleteReply(tenantId: string, replyId: string, actor: { staff?: ScopedUser; author?: ForumAuthor }) {
    const reply = await this.replyModel.findOne({ _id: replyId, tenantId });
    if (!reply) throw new NotFoundException('Reply not found');
    const isOwnPost = actor.author && reply.authorType === actor.author.type && reply.authorId === actor.author.id;
    if (!isOwnPost) {
      if (!actor.staff) throw new ForbiddenException('You can only delete your own posts.');
      const syllabus = await this.getSyllabusOrThrow(String(reply.syllabusId), tenantId);
      await this.assertStaffCanModerate(syllabus, actor.staff);
    }
    await reply.deleteOne();
    await this.threadModel.updateOne({ _id: reply.threadId }, { $inc: { replyCount: -1 } });
    return { message: 'Reply deleted' };
  }
}
