import {
  Controller, Get, Post, Patch, Body, Param, Query, Request, ForbiddenException,
} from '@nestjs/common';
import { SignaturesService } from './signatures.service';
import { Public } from '../auth/decorators';

function clientIp(req: any): string | undefined {
  return (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
}

@Controller('documents/signatures')
export class SignaturesController {
  constructor(private readonly service: SignaturesService) {}

  private ctx(req: any) {
    return {
      schoolSlug: req?.user?.schoolSlug || req?.headers['x-school-slug'] || 'demo-school',
      userName: req?.user?.name || 'Admin',
      userId: req?.user?.userId,
    };
  }

  // ── Admin (authenticated) ────────────────────────────────────────────
  @Get('dashboard')
  async getDashboard(@Request() req: any) {
    const { schoolSlug, userId } = this.ctx(req);
    const userEmail = await this.service.resolveUserEmail(userId);
    return this.service.getDashboard(schoolSlug, userEmail);
  }

  @Get()
  async list(@Request() req: any, @Query('status') status?: string, @Query('mine') mine?: string) {
    const { schoolSlug, userId } = this.ctx(req);
    const userEmail = mine === 'true' ? await this.service.resolveUserEmail(userId) : undefined;
    return this.service.list(schoolSlug, { status, mine: mine === 'true', userEmail });
  }

  @Post()
  async create(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, userName, userId } = this.ctx(req);
    const userEmail = await this.service.resolveUserEmail(userId);
    return this.service.create(schoolSlug, userName, userEmail, dto);
  }

  @Get(':id')
  async getById(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getById(schoolSlug, id);
  }

  @Patch(':id/cancel')
  async cancel(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.cancel(schoolSlug, id);
  }

  // A recipient who happens to already have a portal login signs in-app,
  // matched to their own account by email - no token needed since they're
  // already authenticated as themselves.
  @Post(':id/sign-mine')
  async signMine(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug, userId } = this.ctx(req);
    const userEmail = await this.service.resolveUserEmail(userId);
    if (!userEmail) throw new ForbiddenException('No email on file for this account');
    return this.service.signAsUser(schoolSlug, id, userEmail, dto, clientIp(req));
  }

  @Post(':id/decline-mine')
  async declineMine(@Param('id') id: string, @Body('reason') reason: string, @Request() req: any) {
    const { schoolSlug, userId } = this.ctx(req);
    const userEmail = await this.service.resolveUserEmail(userId);
    if (!userEmail) throw new ForbiddenException('No email on file for this account');
    return this.service.declineAsUser(schoolSlug, id, userEmail, reason);
  }

  // ── Recipient (public, token-based - no account required) ──────────────
  @Public()
  @Get('public/:token')
  async getByToken(@Param('token') token: string) {
    return this.service.getByToken(token);
  }

  @Public()
  @Post('public/:token/sign')
  async signByToken(@Param('token') token: string, @Body() dto: any, @Request() req: any) {
    return this.service.signByToken(token, dto, clientIp(req));
  }

  @Public()
  @Post('public/:token/decline')
  async declineByToken(@Param('token') token: string, @Body('reason') reason: string) {
    return this.service.declineByToken(token, reason);
  }
}
