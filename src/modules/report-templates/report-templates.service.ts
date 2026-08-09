// ============================================================
// REPORT TEMPLATES SERVICE
// Eldermin ERP | NestJS
// ============================================================

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
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

  // Section `config` and various nested enum fields (borderStyle,
  // logoPosition, section.type, etc.) aren't validated by the DTO — only
  // the top-level `type` is. A malformed payload (e.g. from a future UI
  // change, a hand-crafted API call, or bad data surviving a `duplicate()`)
  // would otherwise throw a raw Mongoose ValidationError straight through
  // as an opaque 500, the same class of bug that was previously found and
  // fixed on Chart of Accounts. Wrapping create/update in the same
  // translate-to-400 pattern keeps that fix consistent across modules.
  async create(schoolSlug: string, dto: CreateReportTemplateDto) {
    try {
      if (dto.isDefault) {
        await this.reportTemplateModel.updateMany(
          { schoolSlug, type: dto.type, isDefault: true },
          { $set: { isDefault: false } },
        );
      }
      return await this.reportTemplateModel.create({ ...dto, schoolSlug });
    } catch (err: any) {
      throw this.translateError(err);
    }
  }

  async update(id: string, schoolSlug: string, dto: UpdateReportTemplateDto) {
    try {
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
    } catch (err: any) {
      if (err instanceof NotFoundException) throw err;
      throw this.translateError(err);
    }
  }

  private translateError(err: any): Error {
    if (err.name === 'ValidationError') {
      const firstIssue = Object.values(err.errors || {})[0] as any;
      return new BadRequestException(firstIssue?.message || 'Invalid report template data.');
    }
    if (err.code === 11000) {
      return new BadRequestException('A template with conflicting unique fields already exists.');
    }
    return err;
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
