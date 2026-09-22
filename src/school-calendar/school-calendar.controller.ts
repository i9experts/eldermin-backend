import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Request } from '@nestjs/common';
import { SchoolCalendarService } from './school-calendar.service';

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

  @Post('events')
  createEvent(@Request() req: any, @Body() body: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.createEvent(schoolSlug, userName, body);
  }

  @Patch('events/:id')
  updateEvent(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateEvent(schoolSlug, id, body);
  }

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

  @Post('circulars')
  createCircular(@Request() req: any, @Body() body: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.createCircular(schoolSlug, userName, body);
  }

  @Patch('circulars/:id')
  updateCircular(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateCircular(schoolSlug, id, body);
  }

  @Delete('circulars/:id')
  deleteCircular(@Request() req: any, @Param('id') id: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.deleteCircular(schoolSlug, id);
  }

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
