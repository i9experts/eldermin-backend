import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, Request, HttpCode, HttpStatus,
  UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ComplianceService } from './compliance.service';

@Controller('compliance')
export class ComplianceController {
  constructor(private readonly service: ComplianceService) {}

  private ctx(req: any) {
    return {
      schoolSlug: req?.user?.schoolSlug || req?.headers['x-school-slug'] || 'demo-school',
      userName: req?.user?.name || 'Admin',
      requestingUser: req?.user,
    };
  }

  @Get('dashboard')
  async getDashboard(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getDashboard(schoolSlug);
  }

  @Get('policies')
  async getPolicies(@Request() req: any, @Query() query: any) {
    const { schoolSlug, requestingUser } = this.ctx(req);
    return this.service.getPolicies(schoolSlug, query, requestingUser);
  }

  @Post('policies')
  @HttpCode(HttpStatus.CREATED)
  async createPolicy(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, userName, requestingUser } = this.ctx(req);
    return this.service.createPolicy({ ...dto, schoolSlug, owner: dto.owner || userName }, requestingUser);
  }

  @Put('policies/:id')
  async updatePolicy(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updatePolicy(id, schoolSlug, dto);
  }

  @Post('policies/:id/acknowledge')
  async acknowledgePolicy(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug, userName, requestingUser } = this.ctx(req);
    return this.service.acknowledgePolicy(id, schoolSlug, dto.staffId || userName, dto.staffName || userName, requestingUser);
  }

  @Post('policies/:id/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadPolicyFile(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.uploadPolicyFile(id, schoolSlug, file);
  }

  @Get('policies/:id/acknowledgements')
  async getPolicyAcknowledgements(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getPolicyAcknowledgements(id, schoolSlug);
  }

  @Get('approvals')
  async getApprovals(@Request() req: any, @Query() query: any) {
    const { schoolSlug, requestingUser } = this.ctx(req);
    return this.service.getApprovals(schoolSlug, query, requestingUser);
  }

  @Post('approvals') @HttpCode(HttpStatus.CREATED)
  async createApproval(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, userName, requestingUser } = this.ctx(req);
    return this.service.createApproval(schoolSlug, dto.requestedBy || userName, dto, requestingUser);
  }

  @Put('approvals/:id')
  async updateApproval(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateApproval(id, schoolSlug, dto);
  }

  @Post('approvals/:id/decide')
  async decideApproval(@Param('id') id: string, @Body() dto: { decision: 'approved' | 'rejected'; comments?: string }, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.decideApprovalStage(id, schoolSlug, dto.decision, dto.comments || '', userName);
  }

  @Get('safeguarding')
  async getSafeguarding(@Request() req: any, @Query() query: any) {
    const { schoolSlug, requestingUser } = this.ctx(req);
    return this.service.getSafeguardingCases(schoolSlug, query, requestingUser);
  }

  @Post('safeguarding')
  @HttpCode(HttpStatus.CREATED)
  async createSafeguarding(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, userName, requestingUser } = this.ctx(req);
    return this.service.createSafeguardingCase({ ...dto, schoolSlug, reportedBy: dto.reportedBy || userName }, requestingUser);
  }

  @Put('safeguarding/:id')
  async updateSafeguarding(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateSafeguardingCase(id, schoolSlug, dto);
  }

  @Post('safeguarding/:id/note')
  async addNote(@Param('id') id: string, @Body('note') note: string, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.addProgressNote(id, schoolSlug, note, userName);
  }

  @Get('audit-logs')
  async getAuditLogs(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getAuditLogs(schoolSlug, query);
  }

  @Post('audit-logs')
  @HttpCode(HttpStatus.CREATED)
  async logAction(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.logAction({ ...dto, schoolSlug, performedBy: dto.performedBy || userName });
  }

  @Get('accreditation')
  async getAccreditation(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getAccreditations(schoolSlug);
  }

  @Post('accreditation')
  @HttpCode(HttpStatus.CREATED)
  async createAccreditation(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createAccreditation({ ...dto, schoolSlug });
  }

  @Put('accreditation/:id')
  async updateAccreditation(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateAccreditation(id, schoolSlug, dto);
  }

  // ── Data Privacy: Consent Records ────────────────────────────
  @Get('data-privacy/consent-records')
  async getConsentRecords(@Request() req: any, @Query() query: any) {
    const { schoolSlug, requestingUser } = this.ctx(req);
    return this.service.getConsentRecords(schoolSlug, query, requestingUser);
  }

  @Post('data-privacy/consent-records')
  @HttpCode(HttpStatus.CREATED)
  async createConsentRecord(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, userName, requestingUser } = this.ctx(req);
    return this.service.createConsentRecord({ ...dto, schoolSlug, recordedBy: dto.recordedBy || userName }, requestingUser);
  }

  @Put('data-privacy/consent-records/:id')
  async updateConsentRecord(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateConsentRecord(id, schoolSlug, dto);
  }

  @Delete('data-privacy/consent-records/:id')
  async deleteConsentRecord(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.deleteConsentRecord(id, schoolSlug);
  }

  // ── Data Privacy: Retention Policies ─────────────────────────
  @Get('data-privacy/retention-policies')
  async getRetentionPolicies(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getRetentionPolicies(schoolSlug, query);
  }

  @Post('data-privacy/retention-policies')
  @HttpCode(HttpStatus.CREATED)
  async createRetentionPolicy(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createRetentionPolicy({ ...dto, schoolSlug });
  }

  @Put('data-privacy/retention-policies/:id')
  async updateRetentionPolicy(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateRetentionPolicy(id, schoolSlug, dto);
  }

  @Delete('data-privacy/retention-policies/:id')
  async deleteRetentionPolicy(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.deleteRetentionPolicy(id, schoolSlug);
  }

  @Post('data-privacy/retention-policies/seed-defaults')
  async seedRetentionPolicyDefaults(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.seedDefaultRetentionPolicies(schoolSlug);
  }

  // ── Data Privacy: Data Subject Requests (DSAR) ───────────────
  @Get('data-privacy/dsar')
  async getDsarRequests(@Request() req: any, @Query() query: any) {
    const { schoolSlug, requestingUser } = this.ctx(req);
    return this.service.getDsarRequests(schoolSlug, query, requestingUser);
  }

  @Post('data-privacy/dsar')
  @HttpCode(HttpStatus.CREATED)
  async createDsarRequest(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, userName, requestingUser } = this.ctx(req);
    return this.service.createDsarRequest({ ...dto, schoolSlug, handledBy: dto.handledBy || userName }, requestingUser);
  }

  @Put('data-privacy/dsar/:id')
  async updateDsarRequest(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateDsarRequest(id, schoolSlug, dto);
  }

  @Delete('data-privacy/dsar/:id')
  async deleteDsarRequest(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.deleteDsarRequest(id, schoolSlug);
  }
}
