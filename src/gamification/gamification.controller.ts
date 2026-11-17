import { Controller, Get, Post, Body, Param, Query, Request } from '@nestjs/common';
import { GamificationService } from './gamification.service';
import { STAFF_WRITE_ROLES } from '../auth/role-sets';
import { RolesOrModuleManage } from '../roles/decorators/roles-or-module-manage.decorator';
import { IsString, IsNumber, Min, Max } from 'class-validator';

class ManualAwardDto {
  @IsNumber() @Min(1) @Max(1000) points: number;
  @IsString() reason: string;
}

@Controller('gamification')
export class GamificationController {
  constructor(private readonly service: GamificationService) {}

  private ctx(req: any) {
    return { schoolSlug: req?.user?.schoolSlug || req?.headers['x-school-slug'] || 'demo-school' };
  }

  @Get('leaderboard')
  getLeaderboard(@Request() req: any, @Query('grade') grade?: string, @Query('section') section?: string, @Query('limit') limit?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getLeaderboard(schoolSlug, { grade, section }, limit ? parseInt(limit, 10) : undefined);
  }

  @Get('students/:studentId/summary')
  getStudentSummary(@Request() req: any, @Param('studentId') studentId: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getStudentSummary(schoolSlug, studentId);
  }

  // Manual bonus points - the one deliberately staff-initiated gamification
  // action, rather than something only auto-awarded by LMS events.
  @RolesOrModuleManage('academics', STAFF_WRITE_ROLES, { allowModuleWide: true })
  @Post('students/:studentId/award')
  manualAward(@Request() req: any, @Param('studentId') studentId: string, @Body() dto: ManualAwardDto) {
    const { schoolSlug } = this.ctx(req);
    return this.service.manualAward(schoolSlug, studentId, dto.points, dto.reason, req.user.name);
  }
}
