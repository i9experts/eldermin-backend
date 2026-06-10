import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ProcurementService } from './procurement.service';

// ============================================================
// PROCUREMENT CONTROLLER
// ============================================================
@Controller('procurement')
export class ProcurementController {
  constructor(private readonly service: ProcurementService) {}

  private ctx(req: any) {
    return {
      schoolSlug: req?.user?.schoolSlug || req?.headers['x-school-slug'] || 'demo-school',
      academicYear: req?.user?.academicYear || req?.headers['x-academic-year'] || '2025-26',
      userName: req?.user?.name || 'Admin',
    };
  }

  // Dashboard
  @Get('dashboard')
  async getDashboard(@Request() req: any, @Query('academicYear') ay?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getDashboard(schoolSlug, ay);
  }

  // Vendors
  @Get('vendors')
  async getVendors(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getVendors(schoolSlug, query);
  }

  @Get('vendors/:id')
  async getVendor(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getVendorById(id, schoolSlug);
  }

  @Post('vendors')
  @HttpCode(HttpStatus.CREATED)
  async createVendor(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createVendor({ ...dto, schoolSlug });
  }

  @Put('vendors/:id')
  async updateVendor(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateVendor(id, schoolSlug, dto);
  }

  @Patch('vendors/:id/rate')
  async rateVendor(@Param('id') id: string, @Body('rating') rating: number, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.rateVendor(id, schoolSlug, rating);
  }

  // Purchase Requests
  @Get('requests')
  async getPRs(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getPRs(schoolSlug, query);
  }

  @Get('requests/:id')
  async getPR(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getPRById(id, schoolSlug);
  }

  @Post('requests')
  @HttpCode(HttpStatus.CREATED)
  async createPR(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, academicYear, userName } = this.ctx(req);
    return this.service.createPR({
      ...dto, schoolSlug,
      academicYear: dto.academicYear || academicYear,
      requestedBy: dto.requestedBy || userName,
    });
  }

  @Patch('requests/:id/submit')
  async submitPR(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.submitPR(id, schoolSlug);
  }

  @Patch('requests/:id/approve')
  async approvePR(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.approvePR(id, schoolSlug, dto.approvedBy || userName, dto.notes);
  }

  @Patch('requests/:id/reject')
  async rejectPR(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.rejectPR(id, schoolSlug, dto.rejectedBy || userName, dto.reason);
  }

  // Purchase Orders
  @Get('orders')
  async getPOs(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getPOs(schoolSlug, query);
  }

  @Get('orders/:id')
  async getPO(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getPOById(id, schoolSlug);
  }

  @Post('orders')
  @HttpCode(HttpStatus.CREATED)
  async createPO(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, academicYear, userName } = this.ctx(req);
    return this.service.createPO({
      ...dto, schoolSlug,
      academicYear: dto.academicYear || academicYear,
      createdBy: userName,
    });
  }

  @Patch('orders/:id/status')
  async updatePOStatus(@Param('id') id: string, @Body('status') status: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updatePOStatus(id, schoolSlug, status);
  }

  @Post('orders/:id/payment')
  async recordPayment(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.recordPayment(id, schoolSlug, dto);
  }

  // GRN
  @Get('grn')
  async getGRNs(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getGRNs(schoolSlug, query);
  }

  @Post('grn')
  @HttpCode(HttpStatus.CREATED)
  async createGRN(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.createGRN({ ...dto, schoolSlug, receivedBy: dto.receivedBy || userName });
  }

  @Patch('grn/:id/verify')
  async verifyGRN(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.verifyGRN(id, schoolSlug, userName);
  }

  // Inventory
  @Get('inventory')
  async getInventory(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getInventory(schoolSlug, query);
  }

  @Get('inventory/summary')
  async getInventorySummary(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getInventorySummary(schoolSlug);
  }

  @Post('inventory')
  @HttpCode(HttpStatus.CREATED)
  async createInventoryItem(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createInventoryItem({ ...dto, schoolSlug });
  }

  @Put('inventory/:id')
  async updateInventoryItem(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateInventoryItem(id, schoolSlug, dto);
  }

  @Patch('inventory/:id/adjust')
  async adjustStock(@Param('id') id: string, @Body() dto: { adjustment: number; reason: string }, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.adjustStock(id, schoolSlug, dto.adjustment, dto.reason);
  }
}
