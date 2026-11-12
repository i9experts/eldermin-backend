// ============================================================
// GUIDED READING SERVICE
// Eldermin ERP | NestJS
// ============================================================

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ReadingLevel, ReadingLevelDocument } from './schemas/reading-level.schema';
import { Reader, ReaderDocument } from './schemas/reader.schema';
import {
  StudentReadingProgress, StudentReadingProgressDocument,
} from './schemas/student-reading-progress.schema';
import { CreateReadingLevelDto, UpdateReadingLevelDto } from './dto/reading-level.dto';
import { CreateReaderDto, UpdateReaderDto } from './dto/reader.dto';

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
