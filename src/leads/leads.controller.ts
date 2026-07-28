import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto, AddLeadNoteDto } from './dto/update-lead.dto';
import { Public, Roles } from '../auth/decorators';
import { UserRole } from '../auth/roles.enum';

@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  // Public — called from the marketing site (onboarding wizard + contact form).
  // No auth, no tenant/school-slug context — these are prospects, not accounts yet.
  @Public()
  @Post()
  create(@Body() dto: CreateLeadDto) {
    return this.leadsService.create(dto);
  }

  // Everything below is internal CRM — restricted to super admin for now.
  // TODO: open up to a future 'sales' role once staff/role management exists.
  @Roles(UserRole.SUPER_ADMIN)
  @Get()
  findAll(@Query('stage') stage?: string) {
    return this.leadsService.findAll(stage);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Get('stats')
  stats() {
    return this.leadsService.stats();
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.leadsService.findOne(id);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateLeadDto) {
    return this.leadsService.update(id, dto);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Post(':id/notes')
  addNote(@Param('id') id: string, @Body() dto: AddLeadNoteDto, @Req() req: any) {
    const authorName = req.user?.name || req.user?.email || 'Unknown';
    const authorId = req.user?.sub;
    return this.leadsService.addNote(id, dto.text, authorName, authorId);
  }
}
