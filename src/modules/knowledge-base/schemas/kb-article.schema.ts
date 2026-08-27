// ============================================================
// KB ARTICLE SCHEMA — In-app contextual help content
// Eldermin ERP | NestJS + MongoDB
//
// GLOBAL platform content: intentionally NOT scoped by tenantId/
// schoolSlug. Every school sees the same help content for a given
// module/tab — this collection has no multi-tenant filter anywhere
// in the service layer, by design.
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type KbArticleDocument = KbArticle & Document;

@Schema({ timestamps: { createdAt: true, updatedAt: true }, collection: 'kb_articles' })
export class KbArticle {
  /** e.g. "hr" */
  @Prop({ required: true, index: true, trim: true })
  module: string;

  /** e.g. "employees" — must match the module's TABS id on the frontend */
  @Prop({ required: true, trim: true })
  tabKey: string;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ default: '', trim: true })
  tagline: string;

  /** Markdown or plain text prose explaining the tab */
  @Prop({ default: '' })
  body: string;

  /** "How to use it" list, rendered as numbered/bulleted steps */
  @Prop({ type: [String], default: [] })
  steps: string[];

  /** Sort order within a module */
  @Prop({ default: 0 })
  order: number;
}

export const KbArticleSchema = SchemaFactory.createForClass(KbArticle);

// One article per module+tabKey.
KbArticleSchema.index({ module: 1, tabKey: 1 }, { unique: true });
KbArticleSchema.index({ module: 1, order: 1 });

// Simple text index backing GET /kb/search — mirrors the regex-$or
// fallback in kb-search.util.ts for environments where a text index
// hasn't been built yet (e.g. a fresh local Mongo).
KbArticleSchema.index({ title: 'text', tagline: 'text', body: 'text', steps: 'text' });
