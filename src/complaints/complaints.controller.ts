import {
  Controller, Get, Post, Patch,
  Body, Param, Query, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ComplaintsService } from './complaints.service';

@Controller('complaints')
export class ComplaintsController {
  constructor(private readonly service: ComplaintsService) {}

  private ctx(req: any) {
    return {
      schoolSlug: req?.user?.schoolSlug || req?.headers['x-school-slug'] || 'demo-school',
      userName: req?.user?.name || 'Admin',
      requestingUser: req?.user,
    };
  }

  @Get('case-types')
  async getCaseTypes(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getCaseTypes(schoolSlug);
  }

  @Post('case-types')
  @HttpCode(HttpStatus.CREATED)
  async createCaseType(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createCaseType(schoolSlug, dto);
  }

  @Patch('case-types/:id')
  async updateCaseType(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateCaseType(id, schoolSlug, dto);
  }

  @Get('aging')
  async getAging(@Request() req: any) {
    const { schoolSlug, requestingUser } = this.ctx(req);
    return this.service.getAgingReport(schoolSlug, requestingUser);
  }

  @Get()
  async getCases(@Request() req: any, @Query() query: any) {
    const { schoolSlug, requestingUser } = this.ctx(req);
    return this.service.getCases(schoolSlug, query, requestingUser);
  }

  @Get(':id')
  async getById(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getCaseById(id, schoolSlug);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createCase(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, requestingUser } = this.ctx(req);
    return this.service.createCase(schoolSlug, dto, requestingUser);
  }

  @Post(':id/remarks')
  async addRemark(@Param('id') id: string, @Body() dto: { text: string }, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.addRemark(id, schoolSlug, dto.text, userName);
  }

  @Patch(':id/reassign')
  async reassign(@Param('id') id: string, @Body() dto: { assigneeId: string; reason?: string }, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.reassignCase(id, schoolSlug, dto.assigneeId, userName, dto.reason);
  }

  @Patch(':id/close')
  async close(@Param('id') id: string, @Body() dto: { resolutionNotes: string }, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.closeCase(id, schoolSlug, dto.resolutionNotes, userName);
  }

  @Patch(':id/reopen')
  async reopen(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.reopenCase(id, schoolSlug);
  }
}
