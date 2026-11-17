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
      const credentials = GoogleAnalyticsService.parseServiceAccountKey(rawKey);
      if (!credentials.client_email || !credentials.private_key) {
        throw new Error('parsed JSON has no client_email/private_key - this is not a service account key file');
      }
      this.client = new BetaAnalyticsDataClient({ credentials });
    } catch (err: any) {
      // Never echo the raw value back (it's a secret) - but a shape
      // diagnostic (length, first/last character) is enough for someone
      // to tell "I pasted the wrong thing" or "this got truncated" apart
      // from "this is genuinely malformed", without us ever seeing or
      // logging the actual key material.
      const len = rawKey.length;
      const shape = len === 0 ? 'empty' : `starts with ${JSON.stringify(rawKey[0])}, ends with ${JSON.stringify(rawKey[len - 1])}, ${len} chars`;
      this.initError = `GA4_SERVICE_ACCOUNT_KEY isn't a usable service account key (${shape}): ${err.message}. ` +
        `Re-copy the ENTIRE .json key file Google downloaded when you created the service account - every ` +
        `character from the opening { to the closing } - and paste it as one value with nothing added or removed. ` +
        `If your environment's secret field strips newlines or quotes, minify the file first ` +
        `(e.g. "python3 -c \\"import json,sys;print(json.dumps(json.load(open('key.json'))))\\" ") and paste that ` +
        `single line instead; base64-encoding the file's contents also works (this will auto-detect it).`;
      this.logger.warn(this.initError);
    }
  }

  /** Accepts the service account key as raw JSON, JSON double-encoded as a
   * quoted/escaped string (some secret-manager UIs wrap a pasted value in
   * an extra pair of quotes), or base64-encoded JSON (the standard
   * workaround when an env var field won't preserve literal newlines/
   * quotes) - tries each in turn and throws the raw-JSON parse error if
   * none of them produce a usable object. */
  private static parseServiceAccountKey(raw: string): any {
    const trimmed = raw.trim();
    let firstError: any = null;

    try {
      let result = JSON.parse(trimmed);
      // A quoted/escaped wrapper (`"{\"client_email\":...}"`) parses as a
      // JSON string whose own content is the real JSON - parse once more.
      if (typeof result === 'string') result = JSON.parse(result);
      return result;
    } catch (err) {
      firstError = err;
    }

    try {
      const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
      return JSON.parse(decoded);
    } catch {
      throw firstError;
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
