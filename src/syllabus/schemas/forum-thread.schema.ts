import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ============================================================
// FORUM THREAD — LMS Phase 4: one discussion board per course
// (Syllabus), not per lesson - matches the common, simplest Moodle forum
// shape ("Course discussion") rather than fragmenting conversation
// across every individual lesson. authorType/authorId/authorName are
// generic rather than a Mongoose ref because a thread can be started by
// either a staff member (Staff._id) or a student (Student._id) - two
// different collections, so a single typed ref isn't possible here.
// ============================================================
export type ForumThreadDocument = ForumThread & Document;

@Schema({ timestamps: true, collection: 'forum_threads' })
export class ForumThread {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Syllabus' }) syllabusId: Types.ObjectId;
  @Prop({ required: true, index: true }) schoolSlug: string;

  @Prop({ required: true }) title: string;
  @Prop({ required: true }) body: string;

  @Prop({ required: true, enum: ['staff', 'student'] }) authorType: string;
  @Prop({ required: true }) authorId: string;
  @Prop({ required: true }) authorName: string;

  // Moderation - staff only (the syllabus's own teacher, or any
  // admin/coordinator role, same ownership rule assertSyllabusOwnership
  // already applies to editing the course itself).
  @Prop({ default: false }) isPinned: boolean;
  @Prop({ default: false }) isLocked: boolean;

  // Cached for a cheap thread-list query - avoids a reply count aggregate
  // on every listing, same "rollup kept in sync on write" convention
  // Syllabus.totalTopics/coveredTopics already uses.
  @Prop({ default: 0 }) replyCount: number;
  @Prop() lastReplyAt: Date;
}

export const ForumThreadSchema = SchemaFactory.createForClass(ForumThread);
ForumThreadSchema.index({ tenantId: 1, syllabusId: 1, isPinned: -1, lastReplyAt: -1, createdAt: -1 });
