import { Controller, Post, Get, Body, Request, HttpCode, HttpStatus, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthService } from './auth.service';
import { IsEmail, IsString, IsOptional, MinLength } from 'class-validator';
import { Public } from '../../auth/decorators';

class LoginDto {
  @IsEmail() email: string;
  @IsString() @MinLength(6) password: string;
  @IsOptional()
  @IsString()
  slug?: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password, dto.slug);
  }

  @Get('me')
  getMe(@Request() req) {
    return this.authService.getMe(req.user.userId, req.user.tenantId);
  }

  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('avatar'))
  uploadAvatar(@Request() req, @UploadedFile() avatar: Express.Multer.File) {
    return this.authService.uploadAvatar(req.user.userId, req.user.tenantId, avatar);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout() {
    return { message: 'Logged out successfully' };
  }
}
