import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MarketingLead, LeadStage } from './schemas/lead.schema';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';

@Injectable()
export class LeadsService {
  constructor(@InjectModel(MarketingLead.name) private leadModel: Model<MarketingLead>) {}

  async create(dto: CreateLeadDto) {
    return this.leadModel.create({ ...dto, stage: 'new' });
  }

  async findAll(stage?: string) {
    const filter = stage ? { stage: stage as LeadStage } : {};
    return this.leadModel
      .find(filter)
      .sort({ createdAt: -1 })
      .populate('assignedTo', 'profile.firstName profile.lastName email')
      .exec();
  }

  async findOne(id: string) {
    const lead = await this.leadModel
      .findById(id)
      .populate('assignedTo', 'profile.firstName profile.lastName email')
      .exec();
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  async update(id: string, dto: UpdateLeadDto) {
    const update: any = { ...dto };
    if (dto.stage === 'contacted') update.lastContactedAt = new Date();
    const lead = await this.leadModel
      .findByIdAndUpdate(id, update, { returnDocument: 'after' })
      .exec();
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  async addNote(id: string, text: string, authorName: string, authorId?: string) {
    const lead = await this.leadModel.findById(id).exec();
    if (!lead) throw new NotFoundException('Lead not found');
    lead.notes.push({ text, authorName, authorId: authorId as any, createdAt: new Date() });
    await lead.save();
    return lead;
  }

  async stats() {
    const stages: LeadStage[] = ['new', 'contacted', 'demo_scheduled', 'trial', 'converted', 'lost'];
    const counts = await Promise.all(stages.map((s) => this.leadModel.countDocuments({ stage: s })));
    return stages.reduce((acc, s, i) => ({ ...acc, [s]: counts[i] }), {} as Record<string, number>);
  }
}
