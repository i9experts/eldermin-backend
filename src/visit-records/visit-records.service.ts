import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { VisitRecord, InterestLevel } from './schemas/visit-record.schema';
import { CreateVisitRecordDto } from './dto/create-visit-record.dto';
import { UpdateVisitRecordDto } from './dto/update-visit-record.dto';

// Numeric rank purely for sorting/prioritizing the rep follow-up queue -
// never stored, derived fresh each read so changing the scale later needs
// no migration.
const INTEREST_RANK: Record<InterestLevel, number> = {
  hot: 4, demo_scheduled: 3, interested: 2, curious: 1, none: 0,
};

@Injectable()
export class VisitRecordsService {
  constructor(@InjectModel(VisitRecord.name) private visitModel: Model<VisitRecord>) {}

  async create(dto: CreateVisitRecordDto, userId: string, userName: string) {
    return this.visitModel.create({
      ...dto,
      location: dto.location || null,
      visitDate: dto.visitDate ? new Date(dto.visitDate) : new Date(),
      nextFollowUpDate: dto.nextFollowUpDate ? new Date(dto.nextFollowUpDate) : null,
      visitedBy: userId,
      visitedByName: userName,
    });
  }

  async findAll(params: {
    institutionType?: string; elderminInterest?: string; smartvanInterest?: string;
    visitedBy?: string; pendingFollowUp?: boolean; search?: string;
  } = {}) {
    const filter: any = {};
    if (params.institutionType) filter.institutionType = params.institutionType;
    if (params.elderminInterest) filter.elderminInterest = params.elderminInterest;
    if (params.smartvanInterest) filter.smartvanInterest = params.smartvanInterest;
    if (params.visitedBy) filter.visitedBy = params.visitedBy;
    if (params.pendingFollowUp) {
      filter.followUpDone = false;
      filter.nextFollowUpDate = { $ne: null };
    }
    if (params.search) {
      filter.$or = [
        { institutionName: { $regex: params.search, $options: 'i' } },
        { city: { $regex: params.search, $options: 'i' } },
        { area: { $regex: params.search, $options: 'i' } },
        { contactName: { $regex: params.search, $options: 'i' } },
      ];
    }
    const records = await this.visitModel.find(filter).sort({ visitDate: -1 }).lean().exec();
    if (!params.pendingFollowUp) return records;
    // Follow-up queue specifically: hottest combined interest first, rather
    // than most-recently-visited first - that's what a rep triaging who to
    // call today actually wants.
    return records.sort((a: any, b: any) => {
      const scoreA = INTEREST_RANK[a.elderminInterest as InterestLevel] + INTEREST_RANK[a.smartvanInterest as InterestLevel];
      const scoreB = INTEREST_RANK[b.elderminInterest as InterestLevel] + INTEREST_RANK[b.smartvanInterest as InterestLevel];
      return scoreB - scoreA;
    });
  }

  async findOne(id: string) {
    const record = await this.visitModel.findById(id).lean().exec();
    if (!record) throw new NotFoundException('Visit record not found');
    return record;
  }

  async update(id: string, dto: UpdateVisitRecordDto) {
    const update: any = { ...dto };
    if (dto.nextFollowUpDate !== undefined) update.nextFollowUpDate = dto.nextFollowUpDate ? new Date(dto.nextFollowUpDate) : null;
    if (dto.visitDate !== undefined) update.visitDate = new Date(dto.visitDate);
    const record = await this.visitModel.findByIdAndUpdate(id, update, { new: true }).exec();
    if (!record) throw new NotFoundException('Visit record not found');
    return record;
  }

  async addFollowUpNote(id: string, text: string, authorName: string, authorId?: string) {
    const record = await this.visitModel.findById(id).exec();
    if (!record) throw new NotFoundException('Visit record not found');
    record.followUpNotes.push({ text, authorName, authorId: authorId as any, createdAt: new Date() });
    await record.save();
    return record;
  }

  async delete(id: string) {
    const deleted = await this.visitModel.findByIdAndDelete(id).lean().exec();
    if (!deleted) throw new NotFoundException('Visit record not found');
    return { deleted: true };
  }

  async stats() {
    const [total, byType, elderminHot, smartvanHot, pendingFollowUp] = await Promise.all([
      this.visitModel.countDocuments(),
      this.visitModel.aggregate([{ $group: { _id: '$institutionType', count: { $sum: 1 } } }]),
      this.visitModel.countDocuments({ elderminInterest: { $in: ['demo_scheduled', 'hot'] } }),
      this.visitModel.countDocuments({ smartvanInterest: { $in: ['demo_scheduled', 'hot'] } }),
      this.visitModel.countDocuments({ followUpDone: false, nextFollowUpDate: { $ne: null, $lte: new Date() } }),
    ]);
    return {
      total,
      byInstitutionType: byType.reduce((acc: Record<string, number>, r: any) => ({ ...acc, [r._id]: r.count }), {}),
      elderminHotLeads: elderminHot,
      smartvanHotLeads: smartvanHot,
      followUpsDue: pendingFollowUp,
    };
  }
}
