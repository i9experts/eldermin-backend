import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Request } from '@nestjs/common';
import { SchoolCalendarService } from './school-calendar.service';
import { Roles } from '../auth/decorators';
import { UserRole } from '../auth/roles.enum';

// Read/acknowledge routes stay open to any authenticated role (parents,
// students, teachers all need to see and acknowledge these); write/publish
// routes are staff-admin-only - see the per-method @Roles below. RolesGuard
// is already global (APP_GUARD in app.module.ts) so @Roles alone is enough,
// no @UseGuards needed here.
const CALENDAR_ADMIN_ROLES = [
  UserRole.SUPER_ADMIN, UserRole.INSTITUTION_OWNER, UserRole.ADMIN,
  UserRole.PRINCIPAL, UserRole.VICE_PRINCIPAL, UserRole.ACADEMIC_COORDINATOR,
];

@Controller('school-calendar')
export class SchoolCalendarController {
  constructor(private readonly service: SchoolCalendarService) {}

  private ctx(req: any) {
    return {
      schoolSlug: req?.user?.schoolSlug,
      userId: req?.user?.userId,
      userName: req?.user?.name || 'User',
    };
  }

  // ─── Calendar ───────────────────────────────────────────────────────────

  @Get('events')
  getEvents(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getEvents(schoolSlug, query);
  }

  @Roles(...CALENDAR_ADMIN_ROLES)
  @Post('events')
  createEvent(@Request() req: any, @Body() body: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.createEvent(schoolSlug, userName, body);
  }

  @Roles(...CALENDAR_ADMIN_ROLES)
  @Patch('events/:id')
  updateEvent(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateEvent(schoolSlug, id, body);
  }

  @Roles(...CALENDAR_ADMIN_ROLES)
  @Delete('events/:id')
  deleteEvent(@Request() req: any, @Param('id') id: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.deleteEvent(schoolSlug, id);
  }

  // ─── Circulars ──────────────────────────────────────────────────────────

  @Get('circulars')
  getCirculars(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getCirculars(schoolSlug, query);
  }

  @Get('circulars/:id')
  getCircularById(@Request() req: any, @Param('id') id: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getCircularById(schoolSlug, id);
  }

  @Roles(...CALENDAR_ADMIN_ROLES)
  @Post('circulars')
  createCircular(@Request() req: any, @Body() body: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.createCircular(schoolSlug, userName, body);
  }

  @Roles(...CALENDAR_ADMIN_ROLES)
  @Patch('circulars/:id')
  updateCircular(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateCircular(schoolSlug, id, body);
  }

  @Roles(...CALENDAR_ADMIN_ROLES)
  @Delete('circulars/:id')
  deleteCircular(@Request() req: any, @Param('id') id: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.deleteCircular(schoolSlug, id);
  }

  @Roles(...CALENDAR_ADMIN_ROLES)
  @Post('circulars/:id/publish')
  publishCircular(@Request() req: any, @Param('id') id: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.publishCircular(schoolSlug, id);
  }

  @Get('circulars/:id/acknowledgment-status')
  getAcknowledgmentStatus(@Request() req: any, @Param('id') id: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getAcknowledgmentStatus(schoolSlug, id);
  }

  @Post('circulars/:id/acknowledge')
  acknowledgeCircular(@Request() req: any, @Param('id') id: string) {
    const { schoolSlug, userId, userName } = this.ctx(req);
    return this.service.acknowledgeCircular(schoolSlug, id, userId, userName);
  }
}
