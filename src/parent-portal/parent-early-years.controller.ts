import { Controller, Get, Param, Query, Request, UseInterceptors } from '@nestjs/common';
import { Roles, AllowNonStaff } from '../auth/decorators';
import { UserRole } from '../auth/roles.enum';
import { GuardianRefreshInterceptor } from './guardian-refresh.interceptor';
import { ParentEarlyYearsService } from './parent-early-years.service';
import { ParentEarlyYearsPageDto } from './dto/parent-early-years.dto';

/**
 * Parent-facing Early Years (read-only). Parent role only (class-level @Roles: student, staff and reseller tokens get 403);
 * the guardian interceptor reloads the parent's linked children on every request; the school always comes from the signed token,
 * never from a header. See ParentEarlyYearsService for the visibility and projection rules.
 * The academic year is resolved on the server (the school's current year); an `x-academic-year` header from a parent client is ignored.
 */
// Opens NonStaffGuard (a parent token is a non-staff token, so without this the controller would be refused the day NON_STAFF_GUARD_MODE=enforce);
// @Roles(PARENT) below is what keeps student, staff and reseller tokens out.
@AllowNonStaff()
@Roles(UserRole.PARENT)
@Controller('parent-portal/students/:studentId/early-years')
@UseInterceptors(GuardianRefreshInterceptor)
export class ParentEarlyYearsController {
  constructor(private readonly service: ParentEarlyYearsService) {}

  @Get('summary')
  summary(@Param('studentId') studentId: string, @Request() req: any) {
    return this.service.getSummary(req.user, studentId);
  }

  @Get('portfolio')
  portfolio(@Param('studentId') studentId: string, @Query() q: ParentEarlyYearsPageDto, @Request() req: any) {
    return this.service.listPortfolio(req.user, studentId, q.page, q.limit);
  }

  @Get('portfolio/:entryId')
  portfolioEntry(@Param('studentId') studentId: string, @Param('entryId') entryId: string, @Request() req: any) {
    return this.service.getPortfolioEntry(req.user, studentId, entryId);
  }

  @Get('observations')
  observations(@Param('studentId') studentId: string, @Query() q: ParentEarlyYearsPageDto, @Request() req: any) {
    return this.service.listObservations(req.user, studentId, q.page, q.limit);
  }
}
