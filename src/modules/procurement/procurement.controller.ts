import { Controller, Get, Post, Patch, Body, Param, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ProcurementService } from './procurement.service';

@Controller('procurement')
@UseGuards(AuthGuard('jwt'))
export class ProcurementController {
  constructor(private readonly procurementService: ProcurementService) {}

  @Get('dashboard')
  getDashboard(@Request() req) { return this.procurementService.getDashboardStats(req.user.tenantId); }

  @Get('vendors')
  getVendors(@Request() req) { return this.procurementService.getVendors(req.user.tenantId); }

  @Post('vendors')
  createVendor(@Request() req, @Body() body: any) { return this.procurementService.createVendor(req.user.tenantId, req.user.institutionId, body); }

  @Patch('vendors/:id')
  updateVendor(@Request() req, @Param('id') id: string, @Body() body: any) { return this.procurementService.updateVendor(req.user.tenantId, id, body); }

  @Patch('vendors/:id/approve')
  approveVendor(@Request() req, @Param('id') id: string) { return this.procurementService.approveVendor(req.user.tenantId, id); }

  @Get('purchase-orders')
  getPOs(@Request() req) { return this.procurementService.getPurchaseOrders(req.user.tenantId); }

  @Post('purchase-orders')
  createPO(@Request() req, @Body() body: any) { return this.procurementService.createPurchaseOrder(req.user.tenantId, req.user.institutionId, body); }

  @Patch('purchase-orders/:id/status')
  updatePOStatus(@Request() req, @Param('id') id: string, @Body() body: { status: string }) { return this.procurementService.updatePOStatus(req.user.tenantId, id, body.status); }

  @Get('inventory')
  getInventory(@Request() req) { return this.procurementService.getInventoryItems(req.user.tenantId); }

  @Post('inventory')
  createItem(@Request() req, @Body() body: any) { return this.procurementService.createInventoryItem(req.user.tenantId, req.user.institutionId, body); }

  @Patch('inventory/:id')
  updateItem(@Request() req, @Param('id') id: string, @Body() body: any) { return this.procurementService.updateInventoryItem(req.user.tenantId, id, body); }

  @Get('inventory/low-stock')
  getLowStock(@Request() req) { return this.procurementService.getLowStockItems(req.user.tenantId); }
}
