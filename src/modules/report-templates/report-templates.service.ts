// ============================================================
// REPORT TEMPLATES SERVICE
// Eldermin ERP | NestJS
// ============================================================

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ReportTemplate, ReportTemplateDocument } from './schemas/report-template.schema';
import { CreateReportTemplateDto, UpdateReportTemplateDto } from './dto/report-template.dto';

@Injectable()
export class ReportTemplatesService {
  constructor(
    @InjectModel(ReportTemplate.name)
    private reportTemplateModel: Model<ReportTemplateDocument>,
  ) {}

  async list(schoolSlug: string) {
    return this.reportTemplateModel
      .find({ schoolSlug })
      .sort({ type: 1, name: 1 })
      .lean();
  }

  async getDefaultForType(schoolSlug: string, type: string) {
    const template = await this.reportTemplateModel
      .findOne({ schoolSlug, type, isDefault: true })
      .lean();
    if (!template) {
      throw new NotFoundException(
        `No default report template found for type: ${type}`,
      );
    }
    return template;
  }

  async findById(id: string, schoolSlug: string) {
    const template = await this.reportTemplateModel
      .findOne({ _id: id, schoolSlug })
      .lean();
    if (!template) throw new NotFoundException('Report template not found');
    return template;
  }

  async create(schoolSlug: string, dto: CreateReportTemplateDto) {
    if (dto.isDefault) {
      await this.reportTemplateModel.updateMany(
        { schoolSlug, type: dto.type, isDefault: true },
        { $set: { isDefault: false } },
      );
    }
    return this.reportTemplateModel.create({ ...dto, schoolSlug });
  }

  async update(id: string, schoolSlug: string, dto: UpdateReportTemplateDto) {
    const existing = await this.reportTemplateModel.findOne({ _id: id, schoolSlug });
    if (!existing) throw new NotFoundException('Report template not found');

    if (dto.isDefault) {
      await this.reportTemplateModel.updateMany(
        { schoolSlug, type: dto.type || existing.type, isDefault: true, _id: { $ne: id } },
        { $set: { isDefault: false } },
      );
    }

    Object.assign(existing, dto);
    await existing.save();
    return existing.toObject();
  }

  async remove(id: string, schoolSlug: string) {
    const deleted = await this.reportTemplateModel.findOneAndDelete({ _id: id, schoolSlug });
    if (!deleted) throw new NotFoundException('Report template not found');
    return { success: true, id };
  }

  async setDefault(id: string, schoolSlug: string) {
    const template = await this.reportTemplateModel.findOne({ _id: id, schoolSlug });
    if (!template) throw new NotFoundException('Report template not found');

    await this.reportTemplateModel.updateMany(
      { schoolSlug, type: template.type, isDefault: true, _id: { $ne: id } },
      { $set: { isDefault: false } },
    );

    template.isDefault = true;
    await template.save();
    return template.toObject();
  }

  async duplicate(id: string, schoolSlug: string) {
    const template = await this.reportTemplateModel.findOne({ _id: id, schoolSlug }).lean();
    if (!template) throw new NotFoundException('Report template not found');

    const copy: any = { ...template };
    delete copy._id;
    delete copy.createdAt;
    delete copy.updatedAt;
    copy.name = `${template.name} (Copy)`;
    copy.isDefault = false;

    return this.reportTemplateModel.create(copy);
  }
}
