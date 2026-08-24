// ============================================================
// RESELLERS CONTROLLER — Eldermin Partner Network (Phase 1)
// Super-Admin-only. Reserved at /super-admin/resellers so it reads as
// part of the same platform-management surface as institutions,
// tickets, and announcements.
// ============================================================

import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ResellersService } from './resellers.service';
import { Roles } from '../auth/decorators';
import { UserRole } from '../auth/roles.enum';

@Roles(UserRole.SUPER_ADMIN)
@Controller('super-admin/resellers')
export class ResellersController {
  constructor(private readonly service: ResellersService) {}

  private adminUser(req: any) {
    return req?.user?.name || req?.headers['x-admin-user'] || 'Super Admin';
  }

  @Get()
  async list(@Query() query: any) {
    return this.service.getResellers(query);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.service.getResellerById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: any, @Request() req: any) {
    return this.service.createReseller(dto, this.adminUser(req));
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: any) {
    return this.service.updateReseller(id, dto);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: { status: string; reason?: string },
    @Request() req: any,
  ) {
    return this.service.updateResellerStatus(
      id,
      dto.status,
      dto.reason || '',
      this.adminUser(req),
    );
  }

  @Post(':id/institutions')
  @HttpCode(HttpStatus.CREATED)
  async provisionInstitution(
    @Param('id') id: string,
    @Body() dto: any,
    @Request() req: any,
  ) {
    return this.service.provisionInstitution(id, dto, this.adminUser(req));
  }

  @Get(':id/commission-summary')
  async commissionSummary(@Param('id') id: string) {
    return this.service.getCommissionSummary(id);
  }
}
