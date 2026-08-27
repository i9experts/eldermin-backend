import { Controller, Get, Post, Delete, Body, Param, Query, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TimetableVariantService } from './timetable-variant.service';

@Controller('teaching/timetable-variants')
@UseGuards(AuthGuard('jwt'))
export class TimetableVariantController {
  constructor(private readonly service: TimetableVariantService) {}

  @Get()
  getVariants(@Request() req, @Query() q: any) { return this.service.getVariants(req.user.tenantId, q); }

  @Get(':id')
  getVariant(@Request() req, @Param('id') id: string) { return this.service.getVariant(req.user.tenantId, id); }

  @Post('generate')
  generate(@Request() req, @Body() body: { timetableIds: string[]; variantCount?: number }) {
    return this.service.generateVariants(req.user.tenantId, req.user.institutionId, req.user.userId, body.timetableIds, body.variantCount);
  }

  @Post(':id/publish')
  publish(@Request() req, @Param('id') id: string) {
    return this.service.publishVariant(req.user.tenantId, req.user.institutionId, id, req.user.userId);
  }

  @Delete(':id')
  deleteVariant(@Request() req, @Param('id') id: string) { return this.service.deleteVariant(req.user.tenantId, id); }
}
