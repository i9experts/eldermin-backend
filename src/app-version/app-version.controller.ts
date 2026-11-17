import { Body, Controller, Get, Header, Param, Patch, Query } from '@nestjs/common';
import { AppVersionService } from './app-version.service';
import { AppVersionQueryDto, UpdateAppVersionDto } from './dto/app-version.dto';
import { Public, Roles } from '../auth/decorators';
import { UserRole } from '../auth/roles.enum';

/** GET /api/v1/app-version?app=parent&platform=ios - no auth, no tenant context (called before login). */
@Controller('app-version')
export class AppVersionPublicController {
  constructor(private readonly service: AppVersionService) {}

  @Public()
  @Get()
  // Overrides the app-wide `Cache-Control: no-store` set in main.ts.
  @Header('Cache-Control', 'public, max-age=300')
  get(@Query() q: AppVersionQueryDto) {
    return this.service.getPublic(q.app, q.platform);
  }
}

/** Platform-owner only (super_admin) - school admins get 403. */
@Roles(UserRole.SUPER_ADMIN)
@Controller('admin/app-versions')
export class AppVersionAdminController {
  constructor(private readonly service: AppVersionService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAppVersionDto) {
    return this.service.update(id, dto);
  }
}
