// ============================================================
// KNOWLEDGE BASE CONTROLLER — REST API
// Eldermin ERP | NestJS
//
// Read endpoints are open to any authenticated user (JwtAuthGuard is
// applied globally in AppModule; no @Roles here means "any logged-in
// user"). Write endpoints are gated to SUPER_ADMIN, mirroring how
// other platform/global-content admin routes in this codebase (e.g.
// SuperAdminController) restrict content management.
// ============================================================

import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { Roles } from '../../auth/decorators';
import { UserRole } from '../../auth/roles.enum';
import { KnowledgeBaseService } from './knowledge-base.service';
import { CreateKbArticleDto, UpdateKbArticleDto } from './dto/kb-article.dto';

@Controller('kb')
export class KnowledgeBaseController {
  constructor(private readonly kbService: KnowledgeBaseService) {}

  /** GET /api/v1/kb/articles?module=hr — any authenticated user */
  @Get('articles')
  async list(@Query('module') moduleFilter?: string) {
    return this.kbService.list(moduleFilter);
  }

  /** GET /api/v1/kb/search?q=... — any authenticated user */
  @Get('search')
  async search(@Query('q') q: string) {
    return this.kbService.search(q);
  }

  /** GET /api/v1/kb/articles/:module/:tabKey — any authenticated user */
  @Get('articles/:module/:tabKey')
  async findOne(@Param('module') moduleKey: string, @Param('tabKey') tabKey: string) {
    return this.kbService.findOne(moduleKey, tabKey);
  }

  /** POST /api/v1/kb/articles — super admin only */
  @Post('articles')
  @Roles(UserRole.SUPER_ADMIN)
  async create(@Body() dto: CreateKbArticleDto) {
    return this.kbService.create(dto);
  }

  /** PATCH /api/v1/kb/articles/:id — super admin only */
  @Patch('articles/:id')
  @Roles(UserRole.SUPER_ADMIN)
  async update(@Param('id') id: string, @Body() dto: UpdateKbArticleDto) {
    return this.kbService.update(id, dto);
  }

  /** DELETE /api/v1/kb/articles/:id — super admin only */
  @Delete('articles/:id')
  @Roles(UserRole.SUPER_ADMIN)
  async remove(@Param('id') id: string) {
    return this.kbService.remove(id);
  }
}
