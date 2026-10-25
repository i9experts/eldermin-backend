// ============================================================
// PUBLIC LEAD FORM CONTROLLER — no auth, no tenant header
// Eldermin ERP | NestJS
//
// Reachable from a link a school admin shares on social media. The
// :token path param is the ONLY tenant identifier on these routes -
// every handler re-validates it against a real, active
// LeadCaptureLink before touching any data. See LeadCaptureLinkService
// for the matching rate-limit/honeypot anti-spam measures.
// ============================================================

import { Body, Controller, Get, Ip, Param, Post } from '@nestjs/common';
import { Public } from '../auth/decorators';
import { LeadCaptureLinkService } from './lead-capture-link.service';
import { PublicLeadFormSubmitDto } from './dto/lead-capture-link.dto';

@Public()
@Controller('public/lead-form')
export class PublicLeadFormController {
  constructor(private readonly linkService: LeadCaptureLinkService) {}

  /** GET /api/v1/public/lead-form/:token */
  @Get(':token')
  async getFormInfo(@Param('token') token: string) {
    return this.linkService.getPublicFormInfo(token);
  }

  /** POST /api/v1/public/lead-form/:token */
  @Post(':token')
  async submit(
    @Param('token') token: string,
    @Body() dto: PublicLeadFormSubmitDto,
    @Ip() ip: string,
  ) {
    return this.linkService.submitPublicForm(token, dto, ip);
  }
}
