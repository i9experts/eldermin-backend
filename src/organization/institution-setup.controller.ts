import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { InstitutionSetupService } from './institution-setup.service';
import {
  CreateBoardMemberDto, UpdateBoardMemberDto,
  CreateCommitteeDto, UpdateCommitteeDto,
  CreateMeetingDto, UpdateMeetingDto,
  CreateWorkflowDto, UpdateWorkflowDto,
} from './dto/institution-setup.dto';

@Controller('organization')
export class InstitutionSetupController {
  constructor(private readonly service: InstitutionSetupService) {}

  private ctx(req: any) {
    return {
      tenantId: req?.user?.tenantId,
      schoolSlug: req?.headers['x-school-slug'] || req?.user?.schoolSlug,
    };
  }

  // ── Board Members ─────────────────────────────────────────
  @Get('board-members')
  async getBoardMembers(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getBoardMembers(schoolSlug);
  }

  @Post('board-members') @HttpCode(HttpStatus.CREATED)
  async createBoardMember(@Body() dto: CreateBoardMemberDto, @Request() req: any) {
    const { tenantId, schoolSlug } = this.ctx(req);
    return this.service.createBoardMember(tenantId, schoolSlug, dto);
  }

  @Put('board-members/:id')
  async updateBoardMember(@Param('id') id: string, @Body() dto: UpdateBoardMemberDto, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateBoardMember(id, schoolSlug, dto);
  }

  @Delete('board-members/:id')
  async deleteBoardMember(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.deleteBoardMember(id, schoolSlug);
  }

  // ── Committees ────────────────────────────────────────────
  @Get('committees')
  async getCommittees(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getCommittees(schoolSlug);
  }

  @Post('committees') @HttpCode(HttpStatus.CREATED)
  async createCommittee(@Body() dto: CreateCommitteeDto, @Request() req: any) {
    const { tenantId, schoolSlug } = this.ctx(req);
    return this.service.createCommittee(tenantId, schoolSlug, dto);
  }

  @Put('committees/:id')
  async updateCommittee(@Param('id') id: string, @Body() dto: UpdateCommitteeDto, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateCommittee(id, schoolSlug, dto);
  }

  @Delete('committees/:id')
  async deleteCommittee(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.deleteCommittee(id, schoolSlug);
  }

  // ── Meetings ──────────────────────────────────────────────
  @Get('meetings')
  async getMeetings(@Request() req: any, @Query('type') type?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getMeetings(schoolSlug, type);
  }

  @Post('meetings') @HttpCode(HttpStatus.CREATED)
  async createMeeting(@Body() dto: CreateMeetingDto, @Request() req: any) {
    const { tenantId, schoolSlug } = this.ctx(req);
    return this.service.createMeeting(tenantId, schoolSlug, dto);
  }

  @Put('meetings/:id')
  async updateMeeting(@Param('id') id: string, @Body() dto: UpdateMeetingDto, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateMeeting(id, schoolSlug, dto);
  }

  @Delete('meetings/:id')
  async deleteMeeting(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.deleteMeeting(id, schoolSlug);
  }

  /** POST /api/v1/organization/meetings/:id/notify — emails every committee
   * member who has an address on file, and reports honestly on WhatsApp
   * (not actually sent — no real WABA account connected yet). */
  @Post('meetings/:id/notify')
  async notifyMeeting(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.notifyMeetingMembers(id, schoolSlug);
  }

  // ── Workflows ─────────────────────────────────────────────
  @Get('workflows')
  async getWorkflows(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getWorkflows(schoolSlug);
  }

  @Post('workflows') @HttpCode(HttpStatus.CREATED)
  async createWorkflow(@Body() dto: CreateWorkflowDto, @Request() req: any) {
    const { tenantId, schoolSlug } = this.ctx(req);
    return this.service.createWorkflow(tenantId, schoolSlug, dto);
  }

  @Put('workflows/:id')
  async updateWorkflow(@Param('id') id: string, @Body() dto: UpdateWorkflowDto, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateWorkflow(id, schoolSlug, dto);
  }

  @Delete('workflows/:id')
  async deleteWorkflow(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.deleteWorkflow(id, schoolSlug);
  }
}
