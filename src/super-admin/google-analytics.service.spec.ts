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

  it('reports not configured, with a non-leaking shape diagnostic, for a truncated/malformed value', async () => {
    // Pins the real-world failure this was built for: a secret-manager UI
    // mangled a multi-line JSON key into a bare fragment like
    // `" edudeen-81..."` - still not valid JSON after trimming/dequoting/
    // base64 fallback, so this must surface a clear, actionable reason
    // without ever echoing the actual (still partly secret) value back.
    const mangled = ' "edudeen-815xx",\n  "private_key_id": "abc123"';
    const service = new GoogleAnalyticsService(makeConfig({
      GA4_PROPERTY_ID: '123456789',
      GA4_SERVICE_ACCOUNT_KEY: mangled,
    }));
    const result = await service.getWebsiteAnalytics();
    expect(result.configured).toBe(false);
    expect(result.reason).not.toContain('edudeen');
    expect(result.reason).toMatch(/entire \.json key file/i);
  });

  const validKeyShape = { client_email: 'ga@project.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n' };

  // These two don't call getWebsiteAnalytics(): with a well-formed but fake
  // key, the real GA SDK would go on to attempt an actual network call that
  // can outlive the test. Checking initError directly (construction-time
  // only) proves the parsing/acceptance itself without touching the network.
  it('accepts the key JSON double-encoded (wrapped in an extra pair of quotes, properly escaped)', () => {
    const wrapped = JSON.stringify(JSON.stringify(validKeyShape));
    const service = new GoogleAnalyticsService(makeConfig({
      GA4_PROPERTY_ID: '123456789',
      GA4_SERVICE_ACCOUNT_KEY: wrapped,
    }));
    expect((service as any).initError).toBeNull();
  });

  it('accepts a base64-encoded key (the standard workaround for env fields that mangle literal JSON)', () => {
    const encoded = Buffer.from(JSON.stringify(validKeyShape)).toString('base64');
    const service = new GoogleAnalyticsService(makeConfig({
      GA4_PROPERTY_ID: '123456789',
      GA4_SERVICE_ACCOUNT_KEY: encoded,
    }));
    expect((service as any).initError).toBeNull();
  });

  it('rejects valid JSON that is missing client_email/private_key with a clear reason', async () => {
    const service = new GoogleAnalyticsService(makeConfig({
      GA4_PROPERTY_ID: '123456789',
      GA4_SERVICE_ACCOUNT_KEY: JSON.stringify({ type: 'service_account', project_id: 'demo' }),
    }));
    const result = await service.getWebsiteAnalytics();
    expect(result.configured).toBe(false);
    expect(result.reason).toMatch(/not a service account key file/);
  });
});
