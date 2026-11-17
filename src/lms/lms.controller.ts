import { Controller, Get, Query, Request } from '@nestjs/common';
import { LmsService } from './lms.service';

@Controller('lms')
export class LmsController {
  constructor(private readonly service: LmsService) {}

  private ctx(req: any) {
    return {
      tenantId: req?.user?.tenantId,
      schoolSlug: req?.user?.schoolSlug || req?.headers['x-school-slug'] || 'demo-school',
      requestingUser: req?.user,
    };
  }

  // Read-only overview, open to any authenticated role - same convention
  // as the Syllabus/Assessment dashboards it composes (no @Roles guard on
  // either of those either).
  @Get('overview')
  async getOverview(@Request() req: any, @Query('academicYear') academicYear?: string) {
    const { tenantId, schoolSlug, requestingUser } = this.ctx(req);
    return this.service.getOverview(tenantId, schoolSlug, academicYear, requestingUser);
  }
}
