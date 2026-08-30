import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ProcurementService } from './procurement.service';
import { ProcurementSettingsService } from './procurement-settings.service';

// ============================================================
// PROCUREMENT CONTROLLER
// ============================================================
@Controller('procurement')
export class ProcurementController {
  constructor(
    private readonly service: ProcurementService,
    private readonly settings: ProcurementSettingsService,
  ) {}

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
    return this.service.getPRs(schoolSlug, query, req?.user);
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

  @Put('requests/:id')
  async updatePR(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updatePR(id, schoolSlug, dto);
  }

  @Patch('requests/:id/submit')
  async submitPR(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.submitPR(id, schoolSlug);
  }

  @Patch('requests/:id/approve')
  async approvePR(@Param('id') id: string, @Body() dto: any = {}, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.approvePR(id, schoolSlug, dto?.approvedBy || userName, dto?.notes);
  }

  @Patch('requests/:id/reject')
  async rejectPR(@Param('id') id: string, @Body() dto: any = {}, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.rejectPR(id, schoolSlug, dto?.rejectedBy || userName, dto?.reason);
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

  @Delete('inventory/:id')
  async deleteInventoryItem(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.deleteInventoryItem(id, schoolSlug);
  }

  // Assets
  @Get('assets')
  async getAssets(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getAssets(schoolSlug, query);
  }

  @Get('assets/:id')
  async getAsset(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getAssetById(id, schoolSlug);
  }

  @Post('assets')
  @HttpCode(HttpStatus.CREATED)
  async createAsset(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createAsset({ ...dto, schoolSlug });
  }

  @Put('assets/:id')
  async updateAsset(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateAsset(id, schoolSlug, dto);
  }

  @Delete('assets/:id')
  async deleteAsset(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.deleteAsset(id, schoolSlug);
  }

  // ============================================================
  // MASTER SETTINGS — school-configurable Vendor/Item/Asset categories,
  // Units of Measure, Payment Terms, Depreciation Methods (replaces the
  // old hardcoded VENDOR_CATS/ITEM_CATS/ASSET_CATS/UOM_OPTIONS/
  // PAYMENT_TERMS_LIST/DEPRECIATION_METHODS arrays in the frontend).
  // ============================================================

  @Post('settings/seed-defaults')
  @HttpCode(HttpStatus.OK)
  async seedSettingsDefaults(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.settings.seedDefaults(schoolSlug);
  }

  // Vendor categories
  @Get('settings/vendor-categories')
  async getVendorCategories(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.settings.getVendorCategories(schoolSlug, query);
  }
  @Post('settings/vendor-categories')
  @HttpCode(HttpStatus.CREATED)
  async createVendorCategory(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.settings.createVendorCategory(schoolSlug, dto);
  }
  @Put('settings/vendor-categories/:id')
  async updateVendorCategory(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.settings.updateVendorCategory(schoolSlug, id, dto);
  }
  @Delete('settings/vendor-categories/:id')
  async deleteVendorCategory(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.settings.deleteVendorCategory(schoolSlug, id);
  }

  // Item categories
  @Get('settings/item-categories')
  async getItemCategories(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.settings.getItemCategories(schoolSlug, query);
  }
  @Post('settings/item-categories')
  @HttpCode(HttpStatus.CREATED)
  async createItemCategory(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.settings.createItemCategory(schoolSlug, dto);
  }
  @Put('settings/item-categories/:id')
  async updateItemCategory(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.settings.updateItemCategory(schoolSlug, id, dto);
  }
  @Delete('settings/item-categories/:id')
  async deleteItemCategory(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.settings.deleteItemCategory(schoolSlug, id);
  }

  // Asset categories
  @Get('settings/asset-categories')
  async getAssetCategories(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.settings.getAssetCategories(schoolSlug, query);
  }
  @Post('settings/asset-categories')
  @HttpCode(HttpStatus.CREATED)
  async createAssetCategory(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.settings.createAssetCategory(schoolSlug, dto);
  }
  @Put('settings/asset-categories/:id')
  async updateAssetCategory(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.settings.updateAssetCategory(schoolSlug, id, dto);
  }
  @Delete('settings/asset-categories/:id')
  async deleteAssetCategory(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.settings.deleteAssetCategory(schoolSlug, id);
  }

  // Units of measure
  @Get('settings/units-of-measure')
  async getUnitsOfMeasure(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.settings.getUnitsOfMeasure(schoolSlug, query);
  }
  @Post('settings/units-of-measure')
  @HttpCode(HttpStatus.CREATED)
  async createUnitOfMeasure(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.settings.createUnitOfMeasure(schoolSlug, dto);
  }
  @Put('settings/units-of-measure/:id')
  async updateUnitOfMeasure(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.settings.updateUnitOfMeasure(schoolSlug, id, dto);
  }
  @Delete('settings/units-of-measure/:id')
  async deleteUnitOfMeasure(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.settings.deleteUnitOfMeasure(schoolSlug, id);
  }

  // Payment terms
  @Get('settings/payment-terms')
  async getPaymentTerms(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.settings.getPaymentTerms(schoolSlug, query);
  }
  @Post('settings/payment-terms')
  @HttpCode(HttpStatus.CREATED)
  async createPaymentTerm(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.settings.createPaymentTerm(schoolSlug, dto);
  }
  @Put('settings/payment-terms/:id')
  async updatePaymentTerm(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.settings.updatePaymentTerm(schoolSlug, id, dto);
  }
  @Delete('settings/payment-terms/:id')
  async deletePaymentTerm(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.settings.deletePaymentTerm(schoolSlug, id);
  }

  // Depreciation methods
  @Get('settings/depreciation-methods')
  async getDepreciationMethods(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.settings.getDepreciationMethods(schoolSlug, query);
  }
  @Post('settings/depreciation-methods')
  @HttpCode(HttpStatus.CREATED)
  async createDepreciationMethod(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.settings.createDepreciationMethod(schoolSlug, dto);
  }
  @Put('settings/depreciation-methods/:id')
  async updateDepreciationMethod(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.settings.updateDepreciationMethod(schoolSlug, id, dto);
  }
  @Delete('settings/depreciation-methods/:id')
  async deleteDepreciationMethod(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.settings.deleteDepreciationMethod(schoolSlug, id);
  }
}
