import { Injectable, Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import * as zlib from 'zlib';

export interface AppleDownloadsResult {
  configured: boolean;
  count: number | null;
  windowDays: number | null;
  asOf: string | null;
  error?: string;
}

// Product Type Identifiers that represent an actual new app install (free or
// paid), per Apple's own reference:
// https://developer.apple.com/help/app-store-connect/reference/product-type-identifiers
// Deliberately excludes updates (7, 7F, 7T, F7), re-downloads (3, 3F) and all
// In-App Purchase / subscription codes (FI1, IA1, IA3, IA9, IAY, ...) - none
// of those are a "someone installed the app" event.
const INITIAL_DOWNLOAD_PRODUCT_TYPES = new Set([
  '1', '1F', '1T', 'F1', '1E', '1EP', '1EU', '1-B', 'F1-B',
]);

const SALES_REPORT_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const DOWNLOAD_WINDOW_DAYS = 30; // rolling "recent downloads" total, like a typical store dashboard

@Injectable()
export class AppStoreConnectService {
  private readonly logger = new Logger(AppStoreConnectService.name);
  private cache: { result: AppleDownloadsResult; fetchedAt: number } | null = null;

  private readConfig() {
    const issuerId = process.env.APPLE_ASC_ISSUER_ID;
    const keyId = process.env.APPLE_ASC_KEY_ID;
    const rawPrivateKey = process.env.APPLE_ASC_PRIVATE_KEY;
    const vendorNumber = process.env.APPLE_VENDOR_NUMBER;
    const appSku = process.env.APPLE_APP_SKU;

    if (!issuerId || !keyId || !rawPrivateKey || !vendorNumber || !appSku) {
      return null;
    }
    // Servers commonly store a multi-line PEM as a single env-var line with
    // literal "\n" sequences instead of real newlines - restore them.
    const privateKey = rawPrivateKey.includes('\\n') ? rawPrivateKey.replace(/\\n/g, '\n') : rawPrivateKey;
    return { issuerId, keyId, privateKey, vendorNumber, appSku };
  }

  isConfigured(): boolean {
    return this.readConfig() !== null;
  }

  private buildJwt(issuerId: string, keyId: string, privateKey: string): string {
    const now = Math.floor(Date.now() / 1000);
    return jwt.sign(
      { iss: issuerId, iat: now, exp: now + 20 * 60, aud: 'appstoreconnect-v1' },
      privateKey,
      { algorithm: 'ES256', header: { alg: 'ES256', kid: keyId, typ: 'JWT' } },
    );
  }

  private async fetchDailyReport(token: string, vendorNumber: string, reportDate: string): Promise<Buffer | null> {
    const url = new URL('https://api.appstoreconnect.apple.com/v1/salesReports');
    url.searchParams.set('filter[reportType]', 'SALES');
    url.searchParams.set('filter[reportSubType]', 'SUMMARY');
    url.searchParams.set('filter[frequency]', 'DAILY');
    url.searchParams.set('filter[reportDate]', reportDate);
    url.searchParams.set('filter[vendorNumber]', vendorNumber);
    url.searchParams.set('filter[version]', '1_0');

    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}`, Accept: 'application/a-gzip' } });
    if (res.status === 404) return null; // report not generated for this date (e.g. no sales activity, or too recent)
    if (!res.ok) {
      throw new Error(`App Store Connect salesReports returned ${res.status}: ${await res.text().catch(() => '')}`);
    }
    const gzipped = Buffer.from(await res.arrayBuffer());
    return zlib.gunzipSync(gzipped);
  }

  private parseInstallsForApp(tsv: Buffer, appSku: string): number {
    const text = tsv.toString('utf-8');
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length === 0) return 0;
    const header = lines[0].split('\t');
    const skuIdx = header.indexOf('SKU');
    const appleIdIdx = header.indexOf('Apple Identifier');
    const productTypeIdx = header.indexOf('Product Type Identifier');
    const unitsIdx = header.indexOf('Units');
    if (skuIdx === -1 && appleIdIdx === -1) return 0;
    if (productTypeIdx === -1 || unitsIdx === -1) return 0;

    let total = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split('\t');
      const matchesApp = (skuIdx !== -1 && cols[skuIdx] === appSku) || (appleIdIdx !== -1 && cols[appleIdIdx] === appSku);
      if (!matchesApp) continue;
      if (!INITIAL_DOWNLOAD_PRODUCT_TYPES.has(cols[productTypeIdx])) continue;
      const units = parseInt(cols[unitsIdx], 10);
      if (!Number.isNaN(units)) total += units;
    }
    return total;
  }

  /**
   * Sums initial-install units across the last `DOWNLOAD_WINDOW_DAYS` days of
   * available daily Sales Reports. Apple doesn't publish "today"'s report
   * until the next day, so this starts from yesterday.
   */
  async getRecentDownloads(): Promise<AppleDownloadsResult> {
    if (this.cache && Date.now() - this.cache.fetchedAt < SALES_REPORT_CACHE_TTL_MS) {
      return this.cache.result;
    }

    const config = this.readConfig();
    if (!config) {
      const result: AppleDownloadsResult = { configured: false, count: null, windowDays: null, asOf: null };
      this.cache = { result, fetchedAt: Date.now() };
      return result;
    }

    try {
      const token = this.buildJwt(config.issuerId, config.keyId, config.privateKey);
      let total = 0;
      let daysWithData = 0;
      const today = new Date();
      for (let i = 1; i <= DOWNLOAD_WINDOW_DAYS; i++) {
        const day = new Date(today);
        day.setDate(day.getDate() - i);
        const reportDate = day.toISOString().slice(0, 10);
        const tsv = await this.fetchDailyReport(token, config.vendorNumber, reportDate);
        if (tsv) {
          total += this.parseInstallsForApp(tsv, config.appSku);
          daysWithData++;
        }
      }
      const result: AppleDownloadsResult = {
        configured: true,
        count: total,
        windowDays: DOWNLOAD_WINDOW_DAYS,
        asOf: new Date().toISOString(),
      };
      this.cache = { result, fetchedAt: Date.now() };
      return result;
    } catch (err: any) {
      this.logger.error(`Failed to fetch Apple App Store downloads: ${err?.message || err}`);
      const result: AppleDownloadsResult = {
        configured: true,
        count: null,
        windowDays: null,
        asOf: null,
        error: 'Failed to fetch from App Store Connect - check credentials and vendor/SKU configuration.',
      };
      // Don't cache a transient failure as long as a success - retry sooner.
      this.cache = { result, fetchedAt: Date.now() - SALES_REPORT_CACHE_TTL_MS + 15 * 60 * 1000 };
      return result;
    }
  }
}
