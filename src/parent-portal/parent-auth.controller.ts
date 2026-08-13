import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Public } from '../auth/decorators';
import { ParentAuthService } from './parent-auth.service';

@Controller('parent-portal/auth')
export class ParentAuthController {
  constructor(private readonly service: ParentAuthService) {}

  @Public()
  @Post('request-otp')
  @HttpCode(HttpStatus.OK)
  async requestOtp(@Body() dto: { phone: string }) {
    return this.service.requestOtp(dto.phone);
  }

  @Public()
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() dto: { phone: string; code: string }) {
    return this.service.verifyOtp(dto.phone, dto.code);
  }
}
