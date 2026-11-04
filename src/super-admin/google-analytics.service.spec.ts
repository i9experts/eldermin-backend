import { ConfigService } from '@nestjs/config';
import { GoogleAnalyticsService } from './google-analytics.service';

// Pins the "channel honesty" behaviour: the Website Visitor Metrics widget
// must report configured:false with a plain reason whenever GA4 isn't set
// up, rather than throwing (which would take down the whole Analytics &
// Reports tab for a school that's never touched this feature) or silently
// returning zeros that could be mistaken for real "no traffic" data.

function makeConfig(values: Record<string, string | undefined>) {
  return { get: (key: string) => values[key] } as ConfigService;
}

describe('GoogleAnalyticsService.getWebsiteAnalytics', () => {
  it('reports not configured when neither env var is set', async () => {
    const service = new GoogleAnalyticsService(makeConfig({}));
    const result = await service.getWebsiteAnalytics();
    expect(result.configured).toBe(false);
    expect(result.reason).toMatch(/GA4_PROPERTY_ID/);
  });

  it('reports not configured when only the property id is set', async () => {
    const service = new GoogleAnalyticsService(makeConfig({ GA4_PROPERTY_ID: '123456789' }));
    const result = await service.getWebsiteAnalytics();
    expect(result.configured).toBe(false);
  });

  it('reports not configured (with a clear reason) when the service account key is not valid JSON', async () => {
    const service = new GoogleAnalyticsService(makeConfig({
      GA4_PROPERTY_ID: '123456789',
      GA4_SERVICE_ACCOUNT_KEY: 'not-json',
    }));
    const result = await service.getWebsiteAnalytics();
    expect(result.configured).toBe(false);
    expect(result.reason).toMatch(/not valid JSON/);
  });
});
