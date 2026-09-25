import {
  Controller, Get, Post, Patch, Put, Delete, Body, Param, Query, Request, Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { EventsService } from './events.service';
import { CampaignsService } from './campaigns.service';
import { Public } from '../auth/decorators';

@Controller('events')
export class EventsController {
  constructor(private readonly service: EventsService, private readonly campaigns: CampaignsService) {}

  private ctx(req: any) {
    return { schoolSlug: req?.user?.schoolSlug, userName: req?.user?.name || 'Admin' };
  }

  // ─── Admin: events ──────────────────────────────────────────────────────

  @Get()
  getEvents(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getEvents(schoolSlug, query);
  }

  @Post()
  createEvent(@Request() req: any, @Body() body: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.createEvent(schoolSlug, userName, body);
  }

  @Get(':id')
  getEventById(@Request() req: any, @Param('id') id: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getEventById(schoolSlug, id);
  }

  @Patch(':id')
  updateEvent(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateEvent(schoolSlug, id, body);
  }

  @Delete(':id')
  deleteEvent(@Request() req: any, @Param('id') id: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.deleteEvent(schoolSlug, id);
  }

  @Patch(':id/status')
  setEventStatus(@Request() req: any, @Param('id') id: string, @Body('status') status: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.setEventStatus(schoolSlug, id, status);
  }

  @Get(':id/dashboard')
  getEventDashboard(@Request() req: any, @Param('id') id: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getEventDashboard(schoolSlug, id);
  }

  @Get(':id/gate-stats')
  getGateStats(@Request() req: any, @Param('id') id: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getGateStats(schoolSlug, id);
  }

  // ─── Admin: reserved seating ────────────────────────────────────────────

  @Get(':id/seat-map')
  getSeatMap(@Request() req: any, @Param('id') id: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getSeatMap(schoolSlug, id);
  }

  @Put(':id/seat-map')
  upsertSeatMap(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.upsertSeatMap(schoolSlug, id, body);
  }

  @Delete(':id/seat-map')
  deleteSeatMap(@Request() req: any, @Param('id') id: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.deleteSeatMap(schoolSlug, id);
  }

  // ─── Admin: ticket types ────────────────────────────────────────────────

  @Post(':id/ticket-types')
  createTicketType(@Request() req: any, @Param('id') eventId: string, @Body() body: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createTicketType(schoolSlug, eventId, body);
  }

  @Patch('ticket-types/:ttId')
  updateTicketType(@Request() req: any, @Param('ttId') id: string, @Body() body: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateTicketType(schoolSlug, id, body);
  }

  @Delete('ticket-types/:ttId')
  deleteTicketType(@Request() req: any, @Param('ttId') id: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.deleteTicketType(schoolSlug, id);
  }

  // ─── Admin: promo codes ─────────────────────────────────────────────────

  @Post(':id/promo-codes')
  createPromoCode(@Request() req: any, @Param('id') eventId: string, @Body() body: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createPromoCode(schoolSlug, eventId, body);
  }

  @Patch('promo-codes/:pcId')
  updatePromoCode(@Request() req: any, @Param('pcId') id: string, @Body() body: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updatePromoCode(schoolSlug, id, body);
  }

  @Delete('promo-codes/:pcId')
  deletePromoCode(@Request() req: any, @Param('pcId') id: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.deletePromoCode(schoolSlug, id);
  }

  // ─── Admin: orders (box office) ─────────────────────────────────────────

  @Get(':id/orders')
  getOrders(@Request() req: any, @Param('id') eventId: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getOrders(schoolSlug, eventId);
  }

  // Box-office walk-up sale - admin-entered, paid on the spot (cash) unless
  // explicitly recorded as bank_transfer/at_door pending confirmation.
  @Post(':id/orders')
  createBoxOfficeOrder(@Request() req: any, @Param('id') eventId: string, @Body() body: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.createOrder(schoolSlug, eventId, body, {
      immediatePayment: body.paymentMethod === 'cash' || body.paymentMethod === 'complimentary',
      confirmedBy: userName,
    });
  }

  @Post('orders/:orderId/mark-paid')
  markOrderPaid(@Request() req: any, @Param('orderId') orderId: string) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.markOrderPaid(schoolSlug, orderId, userName);
  }

  @Post('orders/:orderId/cancel')
  cancelOrder(
    @Request() req: any, @Param('orderId') orderId: string,
    @Body('reason') reason: string, @Body('refundReference') refundReference: string,
  ) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.cancelOrder(schoolSlug, orderId, reason, refundReference, userName);
  }

  // ─── Admin: attendees / CRM ─────────────────────────────────────────────

  @Get(':id/attendees')
  getAttendees(@Request() req: any, @Param('id') eventId: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getAttendees(schoolSlug, eventId);
  }

  // ─── Admin: check-in ────────────────────────────────────────────────────

  @Post(':id/check-in')
  checkIn(@Request() req: any, @Param('id') eventId: string, @Body('qrToken') qrToken: string, @Body('gate') gate: string) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.checkInTicket(schoolSlug, eventId, qrToken, gate, userName);
  }

  @Get(':id/check-in/search')
  checkInSearch(@Request() req: any, @Param('id') eventId: string, @Query('q') q: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.checkInByName(schoolSlug, eventId, q || '');
  }

  // ─── Admin: campaigns (CRM) ─────────────────────────────────────────────

  @Get(':id/campaigns')
  getCampaigns(@Request() req: any, @Param('id') eventId: string) {
    const { schoolSlug } = this.ctx(req);
    return this.campaigns.getCampaigns(schoolSlug, eventId);
  }

  @Post(':id/campaigns')
  createCampaign(@Request() req: any, @Param('id') eventId: string, @Body() body: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.campaigns.createCampaign(schoolSlug, eventId, userName, body);
  }

  @Patch('campaigns/:campaignId')
  updateCampaign(@Request() req: any, @Param('campaignId') id: string, @Body() body: any) {
    const { schoolSlug } = this.ctx(req);
    return this.campaigns.updateCampaign(schoolSlug, id, body);
  }

  @Delete('campaigns/:campaignId')
  deleteCampaign(@Request() req: any, @Param('campaignId') id: string) {
    const { schoolSlug } = this.ctx(req);
    return this.campaigns.deleteCampaign(schoolSlug, id);
  }

  @Post('campaigns/:campaignId/send-now')
  sendCampaignNow(@Request() req: any, @Param('campaignId') id: string) {
    const { schoolSlug } = this.ctx(req);
    return this.campaigns.sendCampaignNow(schoolSlug, id);
  }

  // ─── Admin: badges ──────────────────────────────────────────────────────

  @Post('badges/generate')
  async generateBadges(@Request() req: any, @Body('ticketIds') ticketIds: string[], @Res() res: Response) {
    const { schoolSlug } = this.ctx(req);
    const pdf = await this.service.generateBadgesPdf(schoolSlug, ticketIds);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="badges.pdf"' });
    res.send(pdf);
  }

  // ─── Public ──────────────────────────────────────────────────────────────

  @Public()
  @Get('public/:schoolSlug')
  getPublicEvents(@Param('schoolSlug') schoolSlug: string) {
    return this.service.getPublicEvents(schoolSlug);
  }

  @Public()
  @Get('public/:schoolSlug/:slug')
  getPublicEvent(@Param('schoolSlug') schoolSlug: string, @Param('slug') slug: string) {
    return this.service.getPublicEventBySlug(schoolSlug, slug);
  }

  @Public()
  @Post('public/:schoolSlug/:eventId/checkout')
  checkout(@Param('schoolSlug') schoolSlug: string, @Param('eventId') eventId: string, @Body() body: any) {
    return this.service.createOrder(schoolSlug, eventId, body);
  }
}
