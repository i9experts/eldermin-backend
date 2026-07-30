// ============================================================
// FAMILIES CONTROLLER
// Eldermin ERP | NestJS
// ============================================================

import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Request } from '@nestjs/common';
import { FamiliesService } from './families.service';

@Controller('families')
export class FamiliesController {
  constructor(private readonly service: FamiliesService) {}

  private ctx(req: any) {
    return {
      schoolSlug: req?.user?.schoolSlug || req?.headers['x-school-slug'] || 'demo-school',
    };
  }

  @Get()
  async getFamilies(@Request() req: any, @Query('search') search?: string, @Query('verifiedOnly') verifiedOnly?: string) {
    const { schoolSlug } = this.ctx(req);
    const vFilter = verifiedOnly === undefined ? undefined : verifiedOnly === 'true';
    return this.service.getFamilies(schoolSlug, search, vFilter);
  }

  /** GET /api/v1/families/search-by-guardian?query=... — finds any student
   * (linked to a family or not) whose guardian phone/CNIC matches, so staff
   * can quickly link a sibling to an existing family or start a new one. */
  @Get('search-by-guardian')
  async searchByGuardian(@Query('query') query: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.searchByGuardianContact(schoolSlug, query);
  }

  @Get(':id')
  async getFamily(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getFamilyById(id, schoolSlug);
  }

  @Post()
  async createFamily(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createFamily(schoolSlug, dto);
  }

  @Patch(':id')
  async updateFamily(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateFamily(id, schoolSlug, dto);
  }

  @Delete(':id')
  async deleteFamily(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.deleteFamily(id, schoolSlug);
  }

  @Post(':id/link')
  async linkStudent(@Param('id') id: string, @Body('studentId') studentId: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.linkStudent(id, schoolSlug, studentId);
  }

  @Post(':id/unlink')
  async unlinkStudent(@Param('id') id: string, @Body('studentId') studentId: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.unlinkStudent(id, schoolSlug, studentId);
  }

  @Post(':id/verify')
  async verifyFamily(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.verifyFamily(id, schoolSlug);
  }

  @Post('retrofit')
  async retrofit(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.retrofitFamilies(schoolSlug);
  }
}
