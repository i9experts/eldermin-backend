import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Public } from '../auth/decorators';
import { ParentAuthService } from './parent-auth.service';
import { RegisterParentLeadDto, LoginParentLeadDto } from './dto/parent-lead-auth.dto';

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

  // Self-serve signup - works even when the parent's child's school isn't
  // an Eldermin customer yet (see ParentLead). Separate from the phone+OTP
  // flow above, which only works for a parent a school has already added
  // as a guardian.
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterParentLeadDto) {
    return this.service.registerLead(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginParentLeadDto) {
    return this.service.loginLead(dto);
  }
}
