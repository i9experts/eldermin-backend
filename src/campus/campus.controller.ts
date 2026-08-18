import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { CampusService } from './campus.service';

@Controller('campus')
export class CampusController {
  constructor(private readonly service: CampusService) {}

  private ctx(req: any) {
    return {
      schoolSlug: req?.user?.schoolSlug || req?.headers['x-school-slug'] || 'demo-school',
      userName: req?.user?.name || 'Admin',
    };
  }

  @Get('dashboard')
  async getDashboard(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getDashboard(schoolSlug);
  }

  @Get('transport/vehicles')
  async getVehicles(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getVehicles(schoolSlug, query);
  }

  @Post('transport/vehicles')
  @HttpCode(HttpStatus.CREATED)
  async createVehicle(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createVehicle({ ...dto, schoolSlug });
  }

  @Put('transport/vehicles/:id')
  async updateVehicle(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateVehicle(id, schoolSlug, dto);
  }

  @Get('transport/routes')
  async getRoutes(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getRoutes(schoolSlug, query);
  }

  @Post('transport/routes')
  @HttpCode(HttpStatus.CREATED)
  async createRoute(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createRoute({ ...dto, schoolSlug });
  }

  @Put('transport/routes/:id')
  async updateRoute(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateRoute(id, schoolSlug, dto);
  }

  @Get('transport/routes/:id/students')
  async getRouteStudents(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getRouteStudents(id, schoolSlug);
  }

  @Post('transport/students')
  @HttpCode(HttpStatus.CREATED)
  async allocateTransport(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.allocateStudentTransport({ ...dto, schoolSlug });
  }

  @Delete('transport/students/:id')
  async removeTransport(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.removeStudentTransport(id, schoolSlug);
  }

  @Get('hostel/blocks')
  async getBlocks(@Request() req: any, @Query('campusId') campusId?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getBlocks(schoolSlug, campusId);
  }

  @Post('hostel/blocks')
  @HttpCode(HttpStatus.CREATED)
  async createBlock(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createBlock({ ...dto, schoolSlug });
  }

  @Get('hostel/rooms')
  async getRooms(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getRooms(schoolSlug, query);
  }

  @Post('hostel/rooms')
  @HttpCode(HttpStatus.CREATED)
  async createRoom(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createRoom({ ...dto, schoolSlug });
  }

  @Get('hostel/allocations')
  async getAllocations(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getHostelAllocations(schoolSlug, query);
  }

  @Post('hostel/allocations')
  @HttpCode(HttpStatus.CREATED)
  async allocateHostel(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.allocateHostel({ ...dto, schoolSlug });
  }

  @Patch('hostel/allocations/:id/checkout')
  async checkOut(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.checkOutHostel(id, schoolSlug);
  }

  @Get('maintenance')
  async getMaintenance(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getMaintenanceRequests(schoolSlug, query);
  }

  @Get('maintenance/stats')
  async getMaintenanceStats(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getMaintenanceStats(schoolSlug);
  }

  @Post('maintenance')
  @HttpCode(HttpStatus.CREATED)
  async createMaintenance(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.createMaintenance({
      ...dto, schoolSlug, reportedBy: dto.reportedBy || userName,
    });
  }

  @Patch('maintenance/:id/status')
  async updateMaintenanceStatus(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateMaintenanceStatus(id, schoolSlug, dto);
  }

  @Get('assets')
  async getAssets(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getAssets(schoolSlug, query);
  }

  @Get('assets/summary')
  async getAssetSummary(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getAssetSummary(schoolSlug);
  }

  @Post('assets')
  @HttpCode(HttpStatus.CREATED)
  async createAsset(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createAsset({ ...dto, schoolSlug });
  }

  @Put('assets/:id')
  async updateAsset(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateAsset(id, schoolSlug, dto);
  }

  @Patch('assets/:id/dispose')
  async disposeAsset(@Param('id') id: string, @Body('reason') reason: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.disposeAsset(id, schoolSlug, reason);
  }

  @Get('events')
  async getEvents(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getEvents(schoolSlug, query);
  }

  @Post('events')
  @HttpCode(HttpStatus.CREATED)
  async createEvent(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.createEvent({
      ...dto, schoolSlug, organizer: dto.organizer || userName,
    });
  }

  @Put('events/:id')
  async updateEvent(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateEvent(id, schoolSlug, dto);
  }

  @Patch('events/:id/status')
  async updateEventStatus(
    @Param('id') id: string,
    @Body() dto: { status: string; attendance?: number },
    @Request() req: any,
  ) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateEventStatus(id, schoolSlug, dto.status, dto.attendance);
  }
}
