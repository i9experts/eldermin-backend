// ============================================================
// ANALYTICS CONTROLLER
// Eldermin ERP | NestJS
// ============================================================

import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('insights')
  @HttpCode(HttpStatus.OK)
  async generateInsights(@Body('summary') summary: any) {
    const insights = await this.analyticsService.generateInsights(summary || {});
    return { insights };
  }
}
