import {
  Controller, Get, Post, Put,
  Body, Param, Query, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ComplianceService } from './compliance.service';

@Controller('compliance')
export class ComplianceController {
  constructor(private readonly service: ComplianceService) {}

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

  @Get('policies')
  async getPolicies(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getPolicies(schoolSlug, query);
  }

  @Post('policies')
  @HttpCode(HttpStatus.CREATED)
  async createPolicy(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.createPolicy({ ...dto, schoolSlug, owner: dto.owner || userName });
  }

  @Put('policies/:id')
  async updatePolicy(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updatePolicy(id, schoolSlug, dto);
  }

  @Post('policies/:id/acknowledge')
  async acknowledgePolicy(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.acknowledgePolicy(id, schoolSlug, dto.staffId || userName, dto.staffName || userName);
  }

  @Get('safeguarding')
  async getSafeguarding(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getSafeguardingCases(schoolSlug, query);
  }

  @Post('safeguarding')
  @HttpCode(HttpStatus.CREATED)
  async createSafeguarding(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.createSafeguardingCase({ ...dto, schoolSlug, reportedBy: dto.reportedBy || userName });
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
}
