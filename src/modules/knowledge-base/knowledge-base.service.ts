// ============================================================
// KNOWLEDGE BASE SERVICE
// Eldermin ERP | NestJS
//
// GLOBAL platform content — no tenantId/schoolSlug filter anywhere
// in this service, intentionally. Every school reads the same
// KbArticle collection.
// ============================================================

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { KbArticle, KbArticleDocument } from './schemas/kb-article.schema';
import { CreateKbArticleDto, UpdateKbArticleDto } from './dto/kb-article.dto';
import { buildKbSearchMongoFilter, normalizeQuery } from './kb-search.util';
import { hrArticles } from '../../seed/seed-kb-articles';

@Injectable()
export class KnowledgeBaseService {
  constructor(
    @InjectModel(KbArticle.name) private readonly kbArticleModel: Model<KbArticleDocument>,
  ) {}

  /** GET /kb/articles?module=hr — sorted by order */
  async list(moduleFilter?: string): Promise<KbArticle[]> {
    const filter = moduleFilter ? { module: moduleFilter } : {};
    return this.kbArticleModel.find(filter).sort({ order: 1 }).lean();
  }

  /** GET /kb/articles/:module/:tabKey */
  async findOne(moduleKey: string, tabKey: string): Promise<KbArticle> {
    const article = await this.kbArticleModel.findOne({ module: moduleKey, tabKey }).lean();
    if (!article) {
      throw new NotFoundException(`No KB article found for ${moduleKey}/${tabKey}`);
    }
    return article;
  }

  /** GET /kb/search?q=... */
  async search(q: string): Promise<KbArticle[]> {
    const normalized = normalizeQuery(q);
    if (!normalized) return [];
    const filter = buildKbSearchMongoFilter(normalized);
    return this.kbArticleModel.find(filter).sort({ module: 1, order: 1 }).lean();
  }

  /** POST /kb/articles */
  async create(dto: CreateKbArticleDto): Promise<KbArticle> {
    return this.kbArticleModel.create(dto);
  }

  /** PATCH /kb/articles/:id */
  async update(id: string, dto: UpdateKbArticleDto): Promise<KbArticle> {
    const updated = await this.kbArticleModel
      .findByIdAndUpdate(id, dto, { new: true })
      .lean();
    if (!updated) {
      throw new NotFoundException(`KB article ${id} not found`);
    }
    return updated;
  }

  /** DELETE /kb/articles/:id */
  async remove(id: string): Promise<{ deleted: boolean }> {
    const result = await this.kbArticleModel.findByIdAndDelete(id).lean();
    if (!result) {
      throw new NotFoundException(`KB article ${id} not found`);
    }
    return { deleted: true };
  }

  /**
   * POST /kb/seed-defaults — one-time bootstrap for environments where
   * `npm run seed:kb` was never run against the database (e.g. no CLI/shell
   * access to the deployed environment). Reuses the exact same article data
   * and upsert-by-(module,tabKey) logic as the standalone seed script, via
   * this already-running app's own injected model instead of spinning up a
   * second Nest application context. Idempotent - safe to call more than
   * once, running it again just refreshes the seeded copy.
   */
  async seedDefaults(): Promise<{ seeded: number; titles: string[] }> {
    const titles: string[] = [];
    for (const article of hrArticles) {
      const result = await this.kbArticleModel.findOneAndUpdate(
        { module: article.module, tabKey: article.tabKey },
        { $set: article },
        { upsert: true, new: true },
      );
      titles.push(result!.title);
    }
    return { seeded: hrArticles.length, titles };
  }
}
