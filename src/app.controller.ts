import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './auth/decorators';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // Deploy-version visibility: lets anyone (school admin testing a fix, a
  // future Claude session, a status-page check) confirm which commit is
  // actually live in production without shell/DB access. No auth - the
  // commit SHA and boot time aren't sensitive. Railway sets
  // RAILWAY_GIT_COMMIT_SHA automatically on every deploy; GIT_COMMIT_SHA is
  // supported defensively in case that ever changes or this runs elsewhere.
  @Public()
  @Get('health')
  getHealth() {
    return this.appService.getHealth();
  }
}
