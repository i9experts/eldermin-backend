import { Controller, Get, Post, Body, Query, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { HygieneService } from './hygiene.service';
import { BulkLogHygieneDto } from './dto/hygiene-check.dto';
import { STAFF_WRITE_ROLES } from '../auth/role-sets';
import { RolesOrModuleManage } from '../roles/decorators/roles-or-module-manage.decorator';

@Controller('hygiene')
export class HygieneController {
  constructor(private readonly service: HygieneService) {}

  private ctx(req: any) {
    return {
      schoolSlug: req?.user?.schoolSlug || req?.headers['x-school-slug'] || 'demo-school',
      userName: req?.user?.name || 'Staff',
      userId: req?.user?.userId || req?.user?._id,
    };
  }

  @RolesOrModuleManage('students', STAFF_WRITE_ROLES, { allowModuleWide: true })
  @Post('bulk')
  @HttpCode(HttpStatus.CREATED)
  async bulkLog(@Body() dto: BulkLogHygieneDto, @Request() req: any) {
    const { schoolSlug, userName, userId } = this.ctx(req);
    return this.service.bulkLog(schoolSlug, dto, userName, userId);
  }

  @Get('class')
  async getClassChecks(
    @Request() req: any,
    @Query('grade') grade: string,
    @Query('section') section: string,
    @Query('date') date: string,
  ) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getClassChecks(schoolSlug, grade, section, date);
  }
}
