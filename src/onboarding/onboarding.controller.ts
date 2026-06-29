import {
  Controller, Post, Patch, Get, Body,
  Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { Public } from '../auth/decorators';
import { OnboardingService } from './onboarding.service';
import { RegisterDto, SaveStepDto } from './dto/onboarding.dto';

@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Post('register')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto) {
    return this.onboardingService.register(dto);
  }

  @Patch('step')
  async saveStep(@Body() dto: SaveStepDto, @Request() req: any) {
    return this.onboardingService.saveStep(req.user.schoolSlug, req.user.userId, dto);
  }

  @Post('complete')
  async complete(@Request() req: any) {
    return this.onboardingService.complete(req.user.schoolSlug, req.user.userId);
  }

  @Get('session')
  async getSession(@Request() req: any) {
    return this.onboardingService.getSession(req.user.schoolSlug, req.user.userId);
  }
}
