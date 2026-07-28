import { Body, Controller, Get, Post, Request } from '@nestjs/common';
import { SupportService } from './support.service';
import { CreateTicketDto } from './dto/create-ticket.dto';

// Deliberately NOT gated by @Roles(SUPER_ADMIN) — any authenticated school
// user can raise a ticket. The global JwtAuthGuard still applies (no @Public()),
// so this requires a valid logged-in account, just not a specific role.
@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post('tickets')
  create(@Body() dto: CreateTicketDto, @Request() req: any) {
    return this.supportService.create(dto, {
      institutionSlug: req.user.schoolSlug,
      reportedBy: req.user.name,
    });
  }

  @Get('tickets/mine')
  findMine(@Request() req: any) {
    return this.supportService.findMine(req.user.schoolSlug);
  }
}
