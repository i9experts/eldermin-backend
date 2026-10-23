import * as crypto from 'crypto';
import * as zlib from 'zlib';
import * as jwt from 'jsonwebtoken';
import { AppStoreConnectService } from './app-store-connect.service';

// A trimmed-down sample mimicking Apple's real Sales Report TSV header +
// rows: two rows for our app's SKU (one initial download "1F", one update
// "7F" that must be excluded), one row for a DIFFERENT app's SKU (must be
// excluded so a multi-app vendor account doesn't leak other apps' numbers),
// and one In-App Purchase row (must be excluded, not an install).
function sampleTsv(appSku: string, otherAppSku: string) {
  const header = ['Provider', 'SKU', 'Apple Identifier', 'Title', 'Product Type Identifier', 'Units'].join('\t');
  const rows = [
    ['Apple', appSku, '111', 'Eldermin Parent', '1F', '5'],
    ['Apple', appSku, '111', 'Eldermin Parent', '7F', '3'], // update, must be excluded
    ['Apple', appSku, '111', 'Eldermin Parent', 'IA1', '2'], // in-app purchase, must be excluded
    ['Apple', otherAppSku, '222', 'Some Other App', '1F', '99'], // different app, must be excluded
  ];
  return [header, ...rows.map((r) => r.join('\t'))].join('\n');
}

function generateEcKeyPairPem(): string {
  const { privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  } as any);
  return privateKey as unknown as string;
}

describe('AppStoreConnectService', () => {
  const ENV_KEYS = ['APPLE_ASC_ISSUER_ID', 'APPLE_ASC_KEY_ID', 'APPLE_ASC_PRIVATE_KEY', 'APPLE_VENDOR_NUMBER', 'APPLE_APP_SKU'];
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) originalEnv[k] = process.env[k];
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (originalEnv[k] === undefined) delete process.env[k];
      else process.env[k] = originalEnv[k];
    }
    jest.restoreAllMocks();
  });

  it('reports not configured when env vars are missing', async () => {
    for (const k of ENV_KEYS) delete process.env[k];
    const service = new AppStoreConnectService();
    const result = await service.getRecentDownloads();
    expect(result).toEqual({ configured: false, count: null, windowDays: null, asOf: null });
  });

  it('reports not configured when only some env vars are present', async () => {
    delete process.env.APPLE_ASC_ISSUER_ID;
    process.env.APPLE_ASC_KEY_ID = 'key123';
    process.env.APPLE_ASC_PRIVATE_KEY = 'not-a-real-key';
    process.env.APPLE_VENDOR_NUMBER = '12345678';
    process.env.APPLE_APP_SKU = 'com.eldermin.parent';
    const service = new AppStoreConnectService();
    const result = await service.getRecentDownloads();
    expect(result.configured).toBe(false);
  });

  it('sums only initial-download units for the configured app SKU, excluding updates, IAPs, and other apps', async () => {
    const privateKey = generateEcKeyPairPem();
    process.env.APPLE_ASC_ISSUER_ID = 'issuer-123';
    process.env.APPLE_ASC_KEY_ID = 'key-456';
    process.env.APPLE_ASC_PRIVATE_KEY = privateKey.replace(/\n/g, '\\n');
    process.env.APPLE_VENDOR_NUMBER = '87654321';
    process.env.APPLE_APP_SKU = 'com.eldermin.parent';

    const tsv = sampleTsv('com.eldermin.parent', 'com.other.app');
    const gzipped = zlib.gzipSync(Buffer.from(tsv, 'utf-8'));

    const fetchMock = jest.spyOn(global, 'fetch' as any).mockImplementation(async (url: any) => {
      // Simulate only yesterday's report existing; everything else 404s.
      const u = new URL(url.toString());
      const reportDate = u.searchParams.get('filter[reportDate]');
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      if (reportDate === yesterday.toISOString().slice(0, 10)) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => gzipped.buffer.slice(gzipped.byteOffset, gzipped.byteOffset + gzipped.byteLength),
        } as any;
      }
      return { ok: false, status: 404, text: async () => 'Not Found' } as any;
    });

    const service = new AppStoreConnectService();
    const result = await service.getRecentDownloads();

    expect(result.configured).toBe(true);
    expect(result.count).toBe(5); // only the "1F" row for our SKU
    expect(result.windowDays).toBe(30);
    expect(result.asOf).toBeTruthy();
    expect(fetchMock).toHaveBeenCalled();

    // Sanity-check the JWT we sent was a well-formed ES256 token addressed to Apple.
    const firstCallHeaders = (fetchMock.mock.calls[0][1] as any).headers;
    const token = firstCallHeaders.Authorization.replace('Bearer ', '');
    const decoded = jwt.decode(token, { complete: true }) as any;
    expect(decoded.header.alg).toBe('ES256');
    expect(decoded.header.kid).toBe('key-456');
    expect(decoded.payload.iss).toBe('issuer-123');
    expect(decoded.payload.aud).toBe('appstoreconnect-v1');
  });

  it('caches a successful result instead of re-fetching immediately', async () => {
    for (const k of ENV_KEYS) delete process.env[k];
    const service = new AppStoreConnectService();
    const first = await service.getRecentDownloads();
    const fetchMock = jest.spyOn(global, 'fetch' as any);
    const second = await service.getRecentDownloads();
    expect(second).toEqual(first);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns a graceful error result (not a thrown exception) when the API call fails', async () => {
    process.env.APPLE_ASC_ISSUER_ID = 'issuer-123';
    process.env.APPLE_ASC_KEY_ID = 'key-456';
    process.env.APPLE_ASC_PRIVATE_KEY = generateEcKeyPairPem();
    process.env.APPLE_VENDOR_NUMBER = '87654321';
    process.env.APPLE_APP_SKU = 'com.eldermin.parent';

    jest.spyOn(global, 'fetch' as any).mockImplementation(async () => {
      throw new Error('network down');
    });

    const service = new AppStoreConnectService();
    const result = await service.getRecentDownloads();
    expect(result.configured).toBe(true);
    expect(result.count).toBeNull();
    expect(result.error).toBeTruthy();
  });
});
