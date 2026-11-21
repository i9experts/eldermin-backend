import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, Req,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VisitRecordsService } from './visit-records.service';
import { CreateVisitRecordDto } from './dto/create-visit-record.dto';
import { UpdateVisitRecordDto, AddFollowUpNoteDto } from './dto/update-visit-record.dto';
import { Roles } from '../auth/decorators';
import { UserRole } from '../auth/roles.enum';
import { UploadService } from '../upload/upload.service';

// Internal sales CRM - field reps' institution site-visit log, used to
// qualify leads for Eldermin and SmartVan. Company-internal data, no
// tenant/school-slug context at all (not a school's own data), restricted
// to Super Admin for now, same posture as leads.controller.ts.
// TODO: open up to a future 'sales_rep' role once staff/role management
// supports one (see leads.controller.ts's identical note).
@Roles(UserRole.SUPER_ADMIN)
@Controller('visit-records')
export class VisitRecordsController {
  constructor(
    private readonly visitRecordsService: VisitRecordsService,
    private readonly uploadService: UploadService,
  ) {}

  @Post()
  create(@Body() dto: CreateVisitRecordDto, @Req() req: any) {
    const userName = req.user?.name || req.user?.email || 'Unknown';
    return this.visitRecordsService.create(dto, req.user.userId, userName);
  }

  @Get()
  findAll(@Query() query: {
    institutionType?: string; elderminInterest?: string; smartvanInterest?: string;
    visitedBy?: string; pendingFollowUp?: string; search?: string;
  }) {
    return this.visitRecordsService.findAll({
      ...query,
      pendingFollowUp: query.pendingFollowUp === 'true',
    });
  }

  @Get('stats')
  stats() {
    return this.visitRecordsService.stats();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.visitRecordsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateVisitRecordDto) {
    return this.visitRecordsService.update(id, dto);
  }

  @Post(':id/photo')
  @UseInterceptors(FileInterceptor('photo'))
  async uploadPhoto(@Param('id') id: string, @UploadedFile() photo: Express.Multer.File) {
    // 'eldermin-internal' in place of a schoolSlug - this upload isn't
    // scoped to any tenant, but UploadService's key layout needs a
    // namespace segment, same shape every other caller already gives it.
    const uploaded = await this.uploadService.uploadFile(photo, 'visit-records', 'eldermin-internal');
    return this.visitRecordsService.update(id, { photoUrl: uploaded.url } as UpdateVisitRecordDto);
  }

  @Post(':id/follow-up-notes')
  addFollowUpNote(@Param('id') id: string, @Body() dto: AddFollowUpNoteDto, @Req() req: any) {
    const authorName = req.user?.name || req.user?.email || 'Unknown';
    return this.visitRecordsService.addFollowUpNote(id, dto.text, authorName, req.user?.userId);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.visitRecordsService.delete(id);
  }
}
