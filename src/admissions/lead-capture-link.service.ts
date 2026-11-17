// ============================================================
// LEAD CAPTURE LINK SERVICE — Public shareable admission form
// Eldermin ERP | NestJS + MongoDB
// ============================================================

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';

import { LeadCaptureLink, LeadCaptureLinkDocument } from './schemas/lead-capture-link.schema';
import { Lead, LeadDocument } from './schemas/lead.schema';
import { School, SchoolDocument, AcademicYear, AcademicYearDocument } from '../organization/schemas/organization.schema';
import { PublicLeadFormSubmitDto } from './dto/lead-capture-link.dto';

// Simple in-memory per-process rate limit: max submissions per token+IP
// within the window. Good enough for v1 (no @nestjs/throttler dependency
// in this app yet) - this endpoint has no auth at all, so it must not be
// left with zero abuse protection, but a full distributed rate limiter is
// more than this feature needs right now.
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 5;
const submissionTimestamps = new Map<string, number[]>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const existing = (submissionTimestamps.get(key) || []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  );
  if (existing.length >= RATE_LIMIT_MAX) {
    submissionTimestamps.set(key, existing);
    return false;
  }
  existing.push(now);
  submissionTimestamps.set(key, existing);
  return true;
}

@Injectable()
export class LeadCaptureLinkService {
  constructor(
    @InjectModel(LeadCaptureLink.name) private linkModel: Model<LeadCaptureLinkDocument>,
    @InjectModel(Lead.name) private leadModel: Model<LeadDocument>,
    @InjectModel(School.name) private schoolModel: Model<SchoolDocument>,
    @InjectModel(AcademicYear.name) private yearModel: Model<AcademicYearDocument>,
  ) {}

  // ── Authenticated: manage links ──────────────────────────────

  async createLink(schoolSlug: string, campusId: string | undefined, createdBy?: string) {
    const token = crypto.randomBytes(24).toString('hex');
    const link = new this.linkModel({
      schoolSlug,
      token,
      campusId: campusId || null,
      createdBy,
    });
    return link.save();
  }

  async listLinks(schoolSlug: string) {
    return this.linkModel.find({ schoolSlug }).sort({ createdAt: -1 }).lean();
  }

  async updateLink(
    id: string,
    schoolSlug: string,
    patch: { isActive?: boolean; regenerateToken?: boolean },
  ) {
    const link = await this.linkModel.findOne({ _id: id, schoolSlug });
    if (!link) throw new NotFoundException('Lead capture link not found.');

    if (typeof patch.isActive === 'boolean') link.isActive = patch.isActive;
    if (patch.regenerateToken) link.token = crypto.randomBytes(24).toString('hex');

    return link.save();
  }

  // ── Public: render + submit the form ─────────────────────────

  async getPublicFormInfo(token: string) {
    const link = await this.linkModel.findOne({ token, isActive: true }).lean();
    if (!link) throw new NotFoundException('This application link is not available.');

    const school = await this.schoolModel
      .findOne({ slug: link.schoolSlug, isActive: true })
      .select('name logo')
      .lean();
    if (!school) throw new NotFoundException('This application link is not available.');

    return {
      schoolName: school.name,
      schoolLogo: school.logo || '',
      hasCampusChoice: !link.campusId,
    };
  }

  async submitPublicForm(token: string, dto: PublicLeadFormSubmitDto, ip: string) {
    const link = await this.linkModel.findOne({ token, isActive: true });
    if (!link) throw new NotFoundException('This application link is not available.');

    // Honeypot: a real applicant never fills this (hidden on the form).
    // Fake-accept so bots don't learn to adapt.
    if (dto.website) {
      return { success: true };
    }

    if (!checkRateLimit(`${token}:${ip}`)) {
      throw new BadRequestException('Too many submissions. Please try again later.');
    }

    const currentYear = await this.yearModel
      .findOne({ schoolSlug: link.schoolSlug, isCurrent: true })
      .lean();

    const lead = new this.leadModel({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone,
      gradeInterested: dto.gradeInterested,
      source: 'website',
      status: 'new',
      campusPreference: dto.campusPreference,
      notes: dto.notes,
      schoolSlug: link.schoolSlug,
      academicYear: currentYear?.name || new Date().getFullYear().toString(),
    });
    await lead.save();

    link.submissionCount = (link.submissionCount || 0) + 1;
    link.lastSubmittedAt = new Date();
    await link.save();

    return { success: true };
  }
}
