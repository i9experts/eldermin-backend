// ============================================================
// GUIDED READING CONTROLLER — REST API
// Eldermin ERP | NestJS
// ============================================================

import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, Request, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SchoolGuard } from '../auth/school.guard';
import { GuidedReadingService } from './guided-reading.service';
import { CreateReadingLevelDto, UpdateReadingLevelDto } from './dto/reading-level.dto';
import { CreateReaderDto, UpdateReaderDto } from './dto/reader.dto';
import { AssignStudentLevelDto } from './dto/assign-level.dto';

@Controller('guided-reading')
@UseGuards(JwtAuthGuard, SchoolGuard)
export class GuidedReadingController {
  constructor(private readonly guidedReadingService: GuidedReadingService) {}

  private ctx(req: any) {
    return {
      schoolSlug: req?.user?.schoolSlug || req?.headers['x-school-slug'] || 'demo-school',
      userId: req?.user?.sub || req?.user?._id || 'system',
    };
  }

  // ---- Reading Levels ----

  /** GET /api/v1/guided-reading/levels */
  @Get('levels')
  async listLevels(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.guidedReadingService.listLevels(schoolSlug);
  }

  /** POST /api/v1/guided-reading/levels */
  @Post('levels')
  async createLevel(@Body() dto: CreateReadingLevelDto, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.guidedReadingService.createLevel(schoolSlug, dto);
  }

  /** PUT /api/v1/guided-reading/levels/:id */
  @Put('levels/:id')
  async updateLevel(@Param('id') id: string, @Body() dto: UpdateReadingLevelDto, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.guidedReadingService.updateLevel(id, schoolSlug, dto);
  }

  /** DELETE /api/v1/guided-reading/levels/:id */
  @Delete('levels/:id')
  async removeLevel(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.guidedReadingService.removeLevel(id, schoolSlug);
  }

  // ---- Readers ----

  /** GET /api/v1/guided-reading/readers?levelId=... */
  @Get('readers')
  async listReaders(@Query('levelId') levelId: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.guidedReadingService.listReaders(schoolSlug, levelId);
  }

  /** GET /api/v1/guided-reading/readers/:id */
  @Get('readers/:id')
  async getReader(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.guidedReadingService.findReaderById(id, schoolSlug);
  }

  /** POST /api/v1/guided-reading/readers */
  @Post('readers')
  async createReader(@Body() dto: CreateReaderDto, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.guidedReadingService.createReader(schoolSlug, dto);
  }

  /** PUT /api/v1/guided-reading/readers/:id */
  @Put('readers/:id')
  async updateReader(@Param('id') id: string, @Body() dto: UpdateReaderDto, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.guidedReadingService.updateReader(id, schoolSlug, dto);
  }

  /** DELETE /api/v1/guided-reading/readers/:id */
  @Delete('readers/:id')
  async removeReader(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.guidedReadingService.removeReader(id, schoolSlug);
  }

  // ---- Student assignment / progress ----

  /** POST /api/v1/guided-reading/students/:studentId/level */
  @Post('students/:studentId/level')
  async assignStudentLevel(
    @Param('studentId') studentId: string,
    @Body() dto: AssignStudentLevelDto,
    @Request() req: any,
  ) {
    const { schoolSlug, userId } = this.ctx(req);
    return this.guidedReadingService.assignStudentLevel(studentId, schoolSlug, dto.levelId, userId);
  }

  /** GET /api/v1/guided-reading/students/:studentId/progress */
  @Get('students/:studentId/progress')
  async getStudentProgress(@Param('studentId') studentId: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.guidedReadingService.getStudentProgress(studentId, schoolSlug);
  }
}
