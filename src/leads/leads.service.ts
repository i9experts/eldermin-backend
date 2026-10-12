import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MarketingLead, LeadStage } from './schemas/lead.schema';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';

@Injectable()
export class LeadsService {
  constructor(@InjectModel(MarketingLead.name) private leadModel: Model<MarketingLead>) {}

  // A prospect resubmitting the same form (double-click, browser back button,
  // retrying after a validation error) previously created a second, separate
  // lead row for the same email - annoying noise in the pipeline and no way
  // to tell it's the same person. If an open (not yet converted/lost) lead
  // already exists for this email, fold the resubmission into it as a note
  // instead of creating a duplicate; a converted or lost lead is left alone
  // so a genuinely new inquiry from someone who already has history isn't
  // silently merged into a closed record.
  async create(dto: CreateLeadDto) {
    const email = dto.adminEmail.toLowerCase().trim();
    const existing = await this.leadModel.findOne({ adminEmail: email, stage: { $nin: ['converted', 'lost'] } });
    if (existing) {
      const { stage: _ignoredStage, ...rest } = dto as any;
      Object.assign(existing, rest);
      existing.notes.push({
        text: `Submitted the ${dto.source === 'contact_form' ? 'contact' : dto.source} form again - details above refreshed from this submission.`,
        authorName: 'System',
        createdAt: new Date(),
      });
      await existing.save();
      return existing;
    }
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
