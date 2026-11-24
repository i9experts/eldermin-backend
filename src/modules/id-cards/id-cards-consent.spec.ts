import { Types } from 'mongoose';
import { IdCardsService } from './id-cards.service';

// generateIdCardsPdf now resolves every photo/logo URL to an embedded
// data: URI via the real global fetch (see imageUrlToDataUri) before
// handing HTML to Puppeteer - mocked here so tests never make a real
// network call, and so the resolved-vs-unreachable cases are explicit.
const realFetch = global.fetch;
function mockFetchOk() {
  global.fetch = jest.fn(async () => ({
    ok: true,
    headers: { get: () => 'image/jpeg' },
    arrayBuffer: async () => Buffer.from('fake-image-bytes'),
  })) as any;
}
function mockFetchFail() {
  global.fetch = jest.fn(async () => { throw new Error('getaddrinfo ENOTFOUND'); }) as any;
}
afterEach(() => { global.fetch = realFetch; });

const SCHOOL = 'demo-school';
const studentDoc = (id: string, overrides: any = {}) => ({
  _id: new Types.ObjectId(id), firstName: 'A', lastName: 'B', photo: 'https://example.com/a.jpg',
  grNo: 'GR1', currentGrade: '5', currentSection: 'A', ...overrides,
});

function build(opts: { withdrawnStudentIds?: Set<string> } = {}) {
  const withdrawn = opts.withdrawnStudentIds ?? new Set<string>();
  const template = {
    _id: 't1', layoutStyle: 'classic', primaryColor: '#000', accentColor: '#fff',
    showFields: [], showQrCode: false, showBarcode: false, showSignatureLine: false,
  };
  const templateModel: any = { findOne: jest.fn(() => Promise.resolve(template)) };
  const studentModel: any = {
    find: jest.fn((f: any) => ({
      lean: () => Promise.resolve(f._id.$in.map((id: any) => studentDoc(String(id)))),
    })),
  };
  const staffModel: any = { find: jest.fn() };
  const schoolModel: any = { findOne: jest.fn(() => ({ lean: () => Promise.resolve({ name: 'School' }) })) };
  const campusModel: any = { findOne: jest.fn(() => ({ lean: () => Promise.resolve(null) })) };
  const institutionModel: any = { findOne: jest.fn() };
  const consentModel: any = {
    exists: jest.fn(({ subjectRef }: any) => Promise.resolve(withdrawn.has(String(subjectRef)) ? { _id: 'x' } : null)),
  };
  let lastHtml = '';
  const pdfService: any = {
    htmlToPdfWithOptions: jest.fn((html: string) => { lastHtml = html; return Promise.resolve(Buffer.from('pdf')); }),
  };
  const svc = new IdCardsService(templateModel, studentModel, staffModel, schoolModel, campusModel, institutionModel, consentModel, pdfService);
  return { svc, getHtml: () => lastHtml, consentModel, studentModel };
}

describe('ID card generation - photo/video consent enforcement', () => {
  it('student with a withdrawn photo_video_use record: photo omitted, notice rendered, counted', async () => {
    mockFetchOk();
    const id = new Types.ObjectId().toHexString();
    const { svc, getHtml } = build({ withdrawnStudentIds: new Set([id]) });
    const result = await svc.generateIdCardsPdf(SCHOOL, undefined, 'student', [id], undefined, false, 'pvc_card');
    expect(result.photosOmittedForConsent).toBe(1);
    expect(getHtml()).not.toContain('https://example.com/a.jpg');
    expect(getHtml()).not.toContain('data:image');
    expect(getHtml()).toContain('Photo withheld');
  });

  it('student with no consent record at all: photo embedded as a data: URI, not the raw URL', async () => {
    mockFetchOk();
    const id = new Types.ObjectId().toHexString();
    const { svc, getHtml } = build();
    const result = await svc.generateIdCardsPdf(SCHOOL, undefined, 'student', [id], undefined, false, 'pvc_card');
    expect(result.photosOmittedForConsent).toBe(0);
    expect(getHtml()).not.toContain('https://example.com/a.jpg');
    expect(getHtml()).toContain('data:image/jpeg;base64,');
    expect(getHtml()).not.toContain('Photo withheld');
  });

  it('a mixed batch only omits the withdrawn student and counts exactly that one', async () => {
    mockFetchOk();
    const withdrawnId = new Types.ObjectId().toHexString();
    const normalId = new Types.ObjectId().toHexString();
    const { svc } = build({ withdrawnStudentIds: new Set([withdrawnId]) });
    const result = await svc.generateIdCardsPdf(SCHOOL, undefined, 'student', [withdrawnId, normalId], undefined, false, 'pvc_card');
    expect(result.photosOmittedForConsent).toBe(1);
  });
});

describe('ID card generation - resilience (one bad record must never fail the whole batch)', () => {
  it('an unreachable/slow photo URL falls back to the initials card instead of failing the batch', async () => {
    mockFetchFail();
    const id = new Types.ObjectId().toHexString();
    const { svc, getHtml } = build();
    const result = await svc.generateIdCardsPdf(SCHOOL, undefined, 'student', [id], undefined, false, 'pvc_card');
    expect(result.pdf).toBeInstanceOf(Buffer);
    expect(getHtml()).not.toContain('https://example.com/a.jpg');
    expect(getHtml()).toContain('photo-fallback');
  });

  it('a student record with a malformed (non-array) guardians field does not throw', async () => {
    mockFetchOk();
    const id = new Types.ObjectId().toHexString();
    const { svc, studentModel } = build();
    studentModel.find = jest.fn(() => ({
      lean: () => Promise.resolve([{ _id: new Types.ObjectId(id), firstName: 'A', lastName: 'B', guardians: 'not-an-array' }]),
    }));
    await expect(svc.generateIdCardsPdf(SCHOOL, undefined, 'student', [id], undefined, true, 'pvc_card'))
      .resolves.toMatchObject({ photosOmittedForConsent: 0 });
  });

  it('a batch with one withdrawn-consent student and one unreachable-photo student still produces every card', async () => {
    mockFetchFail();
    const withdrawnId = new Types.ObjectId().toHexString();
    const normalId = new Types.ObjectId().toHexString();
    const { svc } = build({ withdrawnStudentIds: new Set([withdrawnId]) });
    const result = await svc.generateIdCardsPdf(SCHOOL, undefined, 'student', [withdrawnId, normalId], undefined, false, 'pvc_card');
    expect(result.pdf).toBeInstanceOf(Buffer);
    expect(result.photosOmittedForConsent).toBe(1);
  });
});

describe('ID card generation - photos are shrunk to card size before rendering', () => {
  it('a multi-MB phone photo is embedded as a small JPEG, not the original', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sharp = require('sharp');
    const big: Buffer = await sharp({ create: { width: 3000, height: 4000, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 40 } } })
      .jpeg({ quality: 85 }).toBuffer();
    global.fetch = jest.fn(async () => ({ ok: true, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => big })) as any;
    const id = new Types.ObjectId().toHexString();
    const { svc, getHtml } = build();
    await svc.generateIdCardsPdf(SCHOOL, undefined, 'student', [id], undefined, false, 'pvc_card');
    const embedded = getHtml().match(/data:image\/jpeg;base64,([A-Za-z0-9+/=]+)/)![1];
    const bytes = Buffer.from(embedded, 'base64');
    const meta = await sharp(bytes).metadata();
    expect(Math.max(meta.width, meta.height)).toBeLessThanOrEqual(600);
    expect(bytes.length).toBeLessThan(big.length / 10);
  });
});
