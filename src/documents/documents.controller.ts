import {
  Controller, Get, Post, Put, Patch,
  Body, Param, Query, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { DocumentsService } from './documents.service';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly service: DocumentsService) {}

  private ctx(req: any) {
    return {
      schoolSlug: req?.user?.schoolSlug || req?.headers['x-school-slug'] || 'demo-school',
      userName: req?.user?.name || 'Admin',
      requestingUser: req?.user,
    };
  }

  // Dashboard
  @Get('dashboard') async getDashboard(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getDashboard(schoolSlug);
  }

  // Documents
  @Get() async getDocs(@Request() req: any, @Query() query: any) {
    const { schoolSlug, requestingUser } = this.ctx(req);
    return this.service.getDocuments(schoolSlug, query, requestingUser);
  }
  @Post() @HttpCode(HttpStatus.CREATED)
  async createDoc(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, userName, requestingUser } = this.ctx(req);
    return this.service.createDocument({ ...dto, schoolSlug, uploadedBy: userName }, requestingUser);
  }
  @Put(':id') async updateDoc(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateDocument(id, schoolSlug, dto);
  }
  @Patch(':id/archive') async archiveDoc(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.archiveDocument(id, schoolSlug);
  }
  @Patch(':id/view') async incrementView(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.incrementView(id, schoolSlug);
  }

  // Workflow Templates
  @Get('workflow-templates') async getTemplates(@Request() req: any, @Query('type') type?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getTemplates(schoolSlug, type);
  }
  @Post('workflow-templates') @HttpCode(HttpStatus.CREATED)
  async createTemplate(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.createTemplate({ ...dto, schoolSlug, createdBy: userName });
  }
  @Post('workflow-templates/seed') async seedTemplates(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.seedDefaultTemplates(schoolSlug);
  }

  // Workflow Instances
  @Get('workflows') async getInstances(@Request() req: any, @Query() query: any) {
    const { schoolSlug, requestingUser } = this.ctx(req);
    return this.service.getInstances(schoolSlug, query, requestingUser);
  }
  @Get('workflows/my-approvals') async getMyApprovals(@Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.getMyPendingApprovals(schoolSlug, userName);
  }
  @Post('workflows') @HttpCode(HttpStatus.CREATED)
  async initiateWorkflow(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, userName, requestingUser } = this.ctx(req);
    return this.service.initiateWorkflow({ ...dto, schoolSlug, initiatedBy: userName }, requestingUser);
  }
  @Patch('workflows/:id/action')
  async takeAction(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.takeAction(id, schoolSlug, dto.stepOrder, dto.action, dto.actionBy || userName, dto.comments);
  }
  @Patch('workflows/:id/cancel')
  async cancelWorkflow(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.cancelWorkflow(id, schoolSlug, userName, dto.reason);
  }
}
