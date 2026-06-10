import { Controller, Post, Get, Body, Request, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { IsEmail, IsString, MinLength } from 'class-validator';

class LoginDto {
  @IsEmail() email: string;
  @IsString() @MinLength(6) password: string;
  @IsString() slug: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password, dto.slug);
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  getMe(@Request() req) {
    return this.authService.getMe(req.user.userId, req.user.tenantId);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout() {
    return { message: 'Logged out successfully' };
  }
}
