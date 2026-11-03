import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BetaAnalyticsDataClient } from '@google-analytics/data';

// ============================================================
// GOOGLE ANALYTICS (GA4) — WEBSITE VISITOR METRICS
// ============================================================
// Pulls real visitor traffic (sessions, users, top pages, realtime active
// users) into the Super Admin > Analytics & Reports tab via the GA4 Data
// API. This is about the marketing/public website's traffic, not
// in-platform usage (that's PlatformAnalyticsTab's module-adoption/login
// data, already served by getPlatformAnalytics - a separate, unrelated
// signal).
//
// Channel honesty, same convention as EmailService/WhatsAppService: this
// only ever activates once BOTH GA4_PROPERTY_ID and GA4_SERVICE_ACCOUNT_KEY
// are configured. Until then (or if the credentials are invalid), it
// reports configured:false with a plain-English reason rather than
// crashing the whole Analytics tab or silently showing zeros that look
// like real traffic.
// ============================================================

export interface WebsiteAnalyticsResult {
  configured: boolean;
  reason?: string;
  realtimeActiveUsers?: number;
  last30Days?: {
    totals: { sessions: number; activeUsers: number; newUsers: number; screenPageViews: number; averageSessionDurationSec: number; bounceRate: number };
    trend: Array<{ date: string; sessions: number; activeUsers: number }>;
  };
  topPages?: Array<{ path: string; views: number }>;
}

@Injectable()
export class GoogleAnalyticsService {
  private readonly logger = new Logger(GoogleAnalyticsService.name);
  private client: BetaAnalyticsDataClient | null = null;
  private propertyId: string | null = null;
  private initError: string | null = null;

  constructor(private readonly config: ConfigService) {
    this.propertyId = this.config.get<string>('GA4_PROPERTY_ID') || null;
    const rawKey = this.config.get<string>('GA4_SERVICE_ACCOUNT_KEY');

    if (!this.propertyId || !rawKey) {
      this.initError = 'GA4_PROPERTY_ID and GA4_SERVICE_ACCOUNT_KEY are not both set.';
      return;
    }
    try {
      // The env var holds the full service-account JSON key file's
      // contents as a string (set via the environment's own secret/env-var
      // mechanism, never committed) - parsed once here rather than reading
      // a file path, since a container filesystem is the wrong place to
      // keep it.
      const credentials = JSON.parse(rawKey);
      this.client = new BetaAnalyticsDataClient({ credentials });
    } catch (err: any) {
      this.initError = `GA4_SERVICE_ACCOUNT_KEY is not valid JSON: ${err.message}`;
      this.logger.warn(this.initError);
    }
  }

  private propertyPath(): string {
    return `properties/${this.propertyId}`;
  }

  async getWebsiteAnalytics(): Promise<WebsiteAnalyticsResult> {
    if (!this.client || !this.propertyId) {
      return { configured: false, reason: this.initError || 'Google Analytics is not configured for this environment.' };
    }

    try {
      const [[realtime], [trendReport], [topPagesReport]] = await Promise.all([
        this.client.runRealtimeReport({
          property: this.propertyPath(),
          metrics: [{ name: 'activeUsers' }],
        }),
        this.client.runReport({
          property: this.propertyPath(),
          dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
          dimensions: [{ name: 'date' }],
          metrics: [
            { name: 'sessions' }, { name: 'activeUsers' }, { name: 'newUsers' },
            { name: 'screenPageViews' }, { name: 'averageSessionDuration' }, { name: 'bounceRate' },
          ],
          orderBys: [{ dimension: { dimensionName: 'date' } }],
        }),
        this.client.runReport({
          property: this.propertyPath(),
          dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
          dimensions: [{ name: 'pagePath' }],
          metrics: [{ name: 'screenPageViews' }],
          orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
          limit: 10,
        }),
      ]);

      const rows = trendReport.rows || [];
      const trend = rows.map((r) => ({
        date: this.formatGaDate(r.dimensionValues?.[0]?.value || ''),
        sessions: Number(r.metricValues?.[0]?.value || 0),
        activeUsers: Number(r.metricValues?.[1]?.value || 0),
      }));
      const totals = rows.reduce(
        (acc, r) => {
          acc.sessions += Number(r.metricValues?.[0]?.value || 0);
          acc.activeUsers += Number(r.metricValues?.[1]?.value || 0);
          acc.newUsers += Number(r.metricValues?.[2]?.value || 0);
          acc.screenPageViews += Number(r.metricValues?.[3]?.value || 0);
          acc.durationSum += Number(r.metricValues?.[4]?.value || 0);
          acc.bounceSum += Number(r.metricValues?.[5]?.value || 0);
          return acc;
        },
        { sessions: 0, activeUsers: 0, newUsers: 0, screenPageViews: 0, durationSum: 0, bounceSum: 0 },
      );
      const dayCount = rows.length || 1;

      const topPages = (topPagesReport.rows || []).map((r) => ({
        path: r.dimensionValues?.[0]?.value || '/',
        views: Number(r.metricValues?.[0]?.value || 0),
      }));

      return {
        configured: true,
        realtimeActiveUsers: Number(realtime.rows?.[0]?.metricValues?.[0]?.value || 0),
        last30Days: {
          totals: {
            sessions: totals.sessions,
            activeUsers: totals.activeUsers,
            newUsers: totals.newUsers,
            screenPageViews: totals.screenPageViews,
            averageSessionDurationSec: Math.round(totals.durationSum / dayCount),
            bounceRate: Number((totals.bounceSum / dayCount).toFixed(1)),
          },
          trend,
        },
        topPages,
      };
    } catch (err: any) {
      // Wrong property ID, service account not granted Viewer access on
      // the property, or the Analytics Data API not enabled on the GCP
      // project all land here - surfaced as a reason, not a 500, since
      // this is a third-party credential/setup problem the school's own
      // super admin needs to go fix, not a bug in Eldermin.
      this.logger.warn(`GA4 Data API call failed: ${err.message}`);
      return { configured: false, reason: `Could not reach Google Analytics: ${err.message}` };
    }
  }

  /** GA4 returns dates as "20260305" (no separators) - reformat to ISO for charting/display. */
  private formatGaDate(raw: string): string {
    if (!/^\d{8}$/.test(raw)) return raw;
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
}
