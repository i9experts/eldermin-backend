import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppVersion, AppVersionDocument } from './schemas/app-version.schema';
import { UpdateAppVersionDto } from './dto/app-version.dto';
import { compareSemver } from './version.util';
import { seedAppVersions } from './app-version.seed';
import { assertValidObjectId } from '../common/utils/object-id.util';

@Injectable()
export class AppVersionService implements OnModuleInit {
  private readonly log = new Logger(AppVersionService.name);
  constructor(@InjectModel(AppVersion.name) private model: Model<AppVersionDocument>) {}

  async onModuleInit() {
    try {
      const n = await seedAppVersions(this.model);
      if (n) this.log.log(`Seeded ${n} app_versions row(s)`);
    } catch (e: any) {
      this.log.warn(`app_versions seed failed: ${e?.message}`);
    }
  }

  async getPublic(app: string, platform: string) {
    const row = await this.model.findOne({ app, platform } as any).lean();
    if (!row) throw new NotFoundException(`No version info for ${app}/${platform}`);
    return {
      latestVersion: row.latestVersion,
      minVersion: row.minVersion,
      storeUrl: row.storeUrl,
      message: row.updateMessage ?? null,
    };
  }

  async list() {
    const rows = await this.model.find().sort({ app: 1, platform: 1 }).lean();
    return rows.map((r: any) => this.toAdmin(r));
  }

  async update(id: string, dto: UpdateAppVersionDto) {
    assertValidObjectId(id, 'app version');
    const set: Record<string, any> = {};
    if (dto.latestVersion !== undefined) set.latestVersion = dto.latestVersion;
    if (dto.minVersion !== undefined) set.minVersion = dto.minVersion;
    if (dto.storeUrl !== undefined) set.storeUrl = dto.storeUrl;
    if (dto.updateMessage !== undefined) set.updateMessage = dto.updateMessage?.trim() ? dto.updateMessage.trim() : null;
    if (!Object.keys(set).length) throw new BadRequestException('Nothing to update');

    const row = await this.model.findById(id).lean();
    if (!row) throw new NotFoundException('App version not found');

    const latest = set.latestVersion ?? row.latestVersion;
    const min = set.minVersion ?? row.minVersion;
    if (compareSemver(min, latest) > 0) {
      throw new BadRequestException(`minVersion (${min}) must not be greater than latestVersion (${latest})`);
    }

    const updated = await this.model.findByIdAndUpdate(id, { $set: set }, { new: true }).lean();
    return this.toAdmin(updated);
  }

  private toAdmin(r: any) {
    return {
      id: String(r._id), app: r.app, platform: r.platform,
      latestVersion: r.latestVersion, minVersion: r.minVersion, storeUrl: r.storeUrl,
      updateMessage: r.updateMessage ?? null, updatedAt: r.updatedAt,
    };
  }
}
