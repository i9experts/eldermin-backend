// ============================================================
// HYGIENE CHECKS
// Eldermin ERP | NestJS
// ============================================================

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { HygieneCheck, HygieneCheckDocument } from './schemas/hygiene-check.schema';
import { BulkLogHygieneDto } from './dto/hygiene-check.dto';

@Injectable()
export class HygieneService {
  constructor(@InjectModel(HygieneCheck.name) private model: Model<HygieneCheckDocument>) {}

  async bulkLog(schoolSlug: string, dto: BulkLogHygieneDto, checkedBy: string, checkedByUserId?: string) {
    const results = await Promise.all(dto.records.map((r) =>
      this.model.findOneAndUpdate(
        { schoolSlug, studentId: new Types.ObjectId(r.studentId), date: new Date(r.date) },
        {
          $set: {
            studentName: r.studentName, grade: r.grade, section: r.section,
            campusId: r.campusId ? new Types.ObjectId(r.campusId) : null,
            items: {
              uniform: r.items.uniform ?? true,
              capOrScarf: r.items.capOrScarf ?? true,
              shoes: r.items.shoes ?? true,
              lunchBrought: r.items.lunchBrought ?? true,
            },
            notes: r.notes, checkedBy,
            checkedByUserId: checkedByUserId ? new Types.ObjectId(checkedByUserId) : undefined,
          },
        },
        { upsert: true, new: true },
      ).lean(),
    ));
    return { logged: results.length };
  }

  async getClassChecks(schoolSlug: string, grade: string, section: string | undefined, date: string) {
    const filter: any = { schoolSlug, grade, date: new Date(date) };
    if (section) filter.section = section;
    return this.model.find(filter).lean();
  }
}
