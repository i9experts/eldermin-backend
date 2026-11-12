// ============================================================
// GUIDED READING SERVICE
// Eldermin ERP | NestJS
// ============================================================

import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ReadingLevel, ReadingLevelDocument } from './schemas/reading-level.schema';
import { Reader, ReaderDocument } from './schemas/reader.schema';
import {
  StudentReadingProgress, StudentReadingProgressDocument,
} from './schemas/student-reading-progress.schema';
import { CreateReadingLevelDto, UpdateReadingLevelDto } from './dto/reading-level.dto';
import { CreateReaderDto, UpdateReaderDto } from './dto/reader.dto';

// Points awarded on a student's first completion of a given reader -
// mirrors LMS lesson_completion's flat per-event amount (10 pts); a
// reader is a bigger activity (listen + read + keywords) so slightly more.
export const READER_COMPLETION_POINTS = 15;

@Injectable()
export class GuidedReadingService {
  constructor(
    @InjectModel(ReadingLevel.name) private levelModel: Model<ReadingLevelDocument>,
    @InjectModel(Reader.name) private readerModel: Model<ReaderDocument>,
    @InjectModel(StudentReadingProgress.name)
    private progressModel: Model<StudentReadingProgressDocument>,
  ) {}

  // ---- Reading Levels ----

  async listLevels(schoolSlug: string) {
    return this.levelModel.find({ schoolSlug }).sort({ order: 1 }).lean();
  }

  async createLevel(schoolSlug: string, dto: CreateReadingLevelDto) {
    try {
      return await this.levelModel.create({ ...dto, schoolSlug });
    } catch (err: any) {
      throw this.translateError(err);
    }
  }

  async updateLevel(id: string, schoolSlug: string, dto: UpdateReadingLevelDto) {
    try {
      const existing = await this.levelModel.findOne({ _id: id, schoolSlug });
      if (!existing) throw new NotFoundException('Reading level not found');
      Object.assign(existing, dto);
      await existing.save();
      return existing.toObject();
    } catch (err: any) {
      if (err instanceof NotFoundException) throw err;
      throw this.translateError(err);
    }
  }

  async removeLevel(id: string, schoolSlug: string) {
    const inUse = await this.readerModel.exists({ schoolSlug, levelId: id });
    if (inUse) {
      throw new BadRequestException('Cannot delete a level that still has readers assigned to it.');
    }
    const deleted = await this.levelModel.findOneAndDelete({ _id: id, schoolSlug });
    if (!deleted) throw new NotFoundException('Reading level not found');
    return { success: true, id };
  }

  // ---- Readers ----

  async listReaders(schoolSlug: string, levelId?: string) {
    const filter: Record<string, any> = { schoolSlug };
    if (levelId) filter.levelId = levelId;
    return this.readerModel.find(filter).sort({ title: 1 }).lean();
  }

  async findReaderById(id: string, schoolSlug: string) {
    const reader = await this.readerModel.findOne({ _id: id, schoolSlug }).lean();
    if (!reader) throw new NotFoundException('Reader not found');
    return reader;
  }

  async createReader(schoolSlug: string, dto: CreateReaderDto) {
    await this.assertLevelExists(dto.levelId, schoolSlug);
    try {
      return await this.readerModel.create({ ...dto, schoolSlug });
    } catch (err: any) {
      throw this.translateError(err);
    }
  }

  async updateReader(id: string, schoolSlug: string, dto: UpdateReaderDto) {
    if (dto.levelId) await this.assertLevelExists(dto.levelId, schoolSlug);
    try {
      const existing = await this.readerModel.findOne({ _id: id, schoolSlug });
      if (!existing) throw new NotFoundException('Reader not found');
      Object.assign(existing, dto);
      await existing.save();
      return existing.toObject();
    } catch (err: any) {
      if (err instanceof NotFoundException) throw err;
      throw this.translateError(err);
    }
  }

  async removeReader(id: string, schoolSlug: string) {
    const deleted = await this.readerModel.findOneAndDelete({ _id: id, schoolSlug });
    if (!deleted) throw new NotFoundException('Reader not found');
    return { success: true, id };
  }

  private async assertLevelExists(levelId: string, schoolSlug: string) {
    const exists = await this.levelModel.exists({ _id: levelId, schoolSlug });
    if (!exists) throw new BadRequestException('Reading level not found for this school.');
  }

  // ---- Student assignment / progress ----

  async assignStudentLevel(studentId: string, schoolSlug: string, levelId: string, assignedBy: string) {
    await this.assertLevelExists(levelId, schoolSlug);
    return this.progressModel.findOneAndUpdate(
      { studentId, schoolSlug },
      { $set: { currentLevelId: levelId, assignedBy, assignedAt: new Date() } },
      { upsert: true, new: true },
    ).lean();
  }

  async getStudentProgress(studentId: string, schoolSlug: string) {
    const progress = await this.progressModel.findOne({ studentId, schoolSlug }).lean();
    return progress || {
      studentId, schoolSlug, currentLevelId: null, completedReaders: [],
    };
  }

  // ---- Student-facing reading player (Phase 3) ----

  // The student's "shelf": the reading level staff assigned them, and every
  // reader at that level (with a completed flag) - the ladder only moves
  // forward when staff advances the student's level, never automatically.
  async getReadingHome(studentId: string, schoolSlug: string) {
    const progress = await this.getStudentProgress(studentId, schoolSlug);
    if (!progress.currentLevelId) {
      return { level: null, readers: [], completedCount: 0 };
    }
    const [level, readers] = await Promise.all([
      this.levelModel.findOne({ _id: progress.currentLevelId, schoolSlug }).lean(),
      this.readerModel.find({ schoolSlug, levelId: progress.currentLevelId, isActive: true })
        .select('title author synopsis coverImageUrl audioUrl estimatedMinutes pages keywords')
        .sort({ title: 1 })
        .lean(),
    ]);
    const completedIds = new Set((progress.completedReaders || []).map((c: any) => String(c.readerId)));
    return {
      level: level || null,
      completedCount: completedIds.size,
      readers: readers.map((r: any) => ({
        _id: r._id,
        title: r.title,
        author: r.author,
        synopsis: r.synopsis,
        coverImageUrl: r.coverImageUrl,
        estimatedMinutes: r.estimatedMinutes,
        pageCount: (r.pages || []).length,
        keywordCount: (r.keywords || []).length,
        hasAudio: !!r.audioUrl,
        isCompleted: completedIds.has(String(r._id)),
      })),
    };
  }

  // Full reader content (pages/audio/keywords) for the player - gated to
  // the student's own assigned level, or a reader they've already
  // completed (so finished books stay re-readable after the level moves on).
  async getReaderForStudent(readerId: string, studentId: string, schoolSlug: string) {
    const reader = await this.readerModel.findOne({ _id: readerId, schoolSlug, isActive: true }).lean();
    if (!reader) throw new NotFoundException('Reader not found');

    const progress = await this.getStudentProgress(studentId, schoolSlug);
    const alreadyCompleted = (progress.completedReaders || []).some((c: any) => String(c.readerId) === String(readerId));
    const isAssignedLevel = progress.currentLevelId && String(progress.currentLevelId) === String(reader.levelId);
    if (!isAssignedLevel && !alreadyCompleted) {
      throw new ForbiddenException('This reader is not part of your current reading level.');
    }
    return { ...reader, isCompleted: alreadyCompleted };
  }

  // Marks a reader complete for a student - idempotent (re-completing an
  // already-finished reader is a no-op, same convention as
  // PointsTransaction's own sourceType/sourceId dedup) so the caller can
  // safely award points only on the real, first completion.
  async completeReaderForStudent(
    readerId: string, studentId: string, schoolSlug: string, keywordsLookedUp: string[] = [],
  ): Promise<{ justCompleted: boolean; reader: ReaderDocument; completedCount: number }> {
    const reader = await this.readerModel.findOne({ _id: readerId, schoolSlug, isActive: true });
    if (!reader) throw new NotFoundException('Reader not found');

    const existing = await this.progressModel.findOne({ studentId, schoolSlug });
    const alreadyCompleted = (existing?.completedReaders || []).some((c) => String(c.readerId) === String(readerId));
    if (alreadyCompleted) {
      return { justCompleted: false, reader, completedCount: existing!.completedReaders.length };
    }

    const isAssignedLevel = existing?.currentLevelId && String(existing.currentLevelId) === String(reader.levelId);
    if (!isAssignedLevel) {
      throw new ForbiddenException('This reader is not part of your current reading level.');
    }

    const updated = await this.progressModel.findOneAndUpdate(
      { studentId, schoolSlug },
      {
        $push: {
          completedReaders: {
            readerId: reader._id, completedAt: new Date(), keywordsLookedUp, pointsAwarded: READER_COMPLETION_POINTS,
          },
        },
      },
      { new: true },
    );
    return { justCompleted: true, reader, completedCount: updated?.completedReaders.length || 0 };
  }

  // ---- Reporting / analytics (Phase 5) ----

  // Staff-facing school-wide snapshot: how many readers/students sit at
  // each level, which readers are actually getting finished, and the
  // totals a school would want on a dashboard. All derived from the same
  // three collections the rest of this service already reads - no
  // separate aggregation/cache table, since a school's reading data is
  // small enough to recompute on every request.
  async getAnalytics(schoolSlug: string) {
    const [levels, readers, progresses] = await Promise.all([
      this.levelModel.find({ schoolSlug }).sort({ order: 1 }).lean(),
      this.readerModel.find({ schoolSlug }).select('title levelId').lean(),
      this.progressModel.find({ schoolSlug }).lean(),
    ]);

    const readerById = new Map(readers.map((r: any) => [String(r._id), r]));
    const readersByLevel = new Map<string, number>();
    for (const r of readers as any[]) {
      const key = String(r.levelId);
      readersByLevel.set(key, (readersByLevel.get(key) || 0) + 1);
    }
    const studentsByLevel = new Map<string, number>();
    const completionCounts = new Map<string, number>();
    let totalCompletions = 0;
    let totalPointsAwarded = 0;
    for (const p of progresses as any[]) {
      if (p.currentLevelId) {
        const key = String(p.currentLevelId);
        studentsByLevel.set(key, (studentsByLevel.get(key) || 0) + 1);
      }
      for (const c of p.completedReaders || []) {
        totalCompletions += 1;
        totalPointsAwarded += c.pointsAwarded || 0;
        const key = String(c.readerId);
        completionCounts.set(key, (completionCounts.get(key) || 0) + 1);
      }
    }

    const levelBreakdown = (levels as any[]).map((l) => ({
      levelId: l._id,
      name: l.name,
      order: l.order,
      readerCount: readersByLevel.get(String(l._id)) || 0,
      studentsAssigned: studentsByLevel.get(String(l._id)) || 0,
    }));

    const topReaders = Array.from(completionCounts.entries())
      .map(([readerId, completions]) => ({
        readerId,
        title: readerById.get(readerId)?.title || 'Untitled reader',
        completions,
      }))
      .sort((a, b) => b.completions - a.completions)
      .slice(0, 10);

    return {
      levelBreakdown,
      totalReaders: readers.length,
      totalStudentsAssigned: progresses.filter((p: any) => p.currentLevelId).length,
      totalCompletions,
      totalPointsAwarded,
      topReaders,
    };
  }

  private translateError(err: any): Error {
    if (err.name === 'ValidationError') {
      const firstIssue = Object.values(err.errors || {})[0] as any;
      return new BadRequestException(firstIssue?.message || 'Invalid guided reading data.');
    }
    if (err.code === 11000) {
      return new BadRequestException('A conflicting record already exists.');
    }
    return err;
  }
}
