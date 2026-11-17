import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ============================================================
// FORUM REPLY — LMS Phase 4
// Deliberately flat (no nested replies-to-replies) - the simplest useful
// shape for a course discussion board, matching this codebase's existing
// preference for flat structures over recursive ones (e.g. AuditLog,
// ParentPortal's Message) until a real need for threading inside a thread
// shows up.
// ============================================================
export type ForumReplyDocument = ForumReply & Document;

@Schema({ timestamps: true, collection: 'forum_replies' })
export class ForumReply {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'ForumThread' }) threadId: Types.ObjectId;
  // Denormalized so a reply can be scoped/queried without a join back
  // through its thread - same reasoning as Assignment.autoSpawnKey style
  // denormalization already used elsewhere in this module.
  @Prop({ required: true, type: Types.ObjectId, ref: 'Syllabus' }) syllabusId: Types.ObjectId;
  @Prop({ required: true, index: true }) schoolSlug: string;

  @Prop({ required: true }) body: string;

  @Prop({ required: true, enum: ['staff', 'student'] }) authorType: string;
  @Prop({ required: true }) authorId: string;
  @Prop({ required: true }) authorName: string;
}

export const ForumReplySchema = SchemaFactory.createForClass(ForumReply);
ForumReplySchema.index({ threadId: 1, createdAt: 1 });
