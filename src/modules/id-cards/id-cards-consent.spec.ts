import { Types } from 'mongoose';
import { IdCardsService } from './id-cards.service';

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
  return { svc, getHtml: () => lastHtml, consentModel };
}

describe('ID card generation - photo/video consent enforcement', () => {
  it('student with a withdrawn photo_video_use record: photo omitted, notice rendered, counted', async () => {
    const id = new Types.ObjectId().toHexString();
    const { svc, getHtml } = build({ withdrawnStudentIds: new Set([id]) });
    const result = await svc.generateIdCardsPdf(SCHOOL, undefined, 'student', [id], undefined, false, 'pvc_card');
    expect(result.photosOmittedForConsent).toBe(1);
    expect(getHtml()).not.toContain('https://example.com/a.jpg');
    expect(getHtml()).toContain('Photo withheld');
  });

  it('student with no consent record at all: photo included as normal (default/opt-out)', async () => {
    const id = new Types.ObjectId().toHexString();
    const { svc, getHtml } = build();
    const result = await svc.generateIdCardsPdf(SCHOOL, undefined, 'student', [id], undefined, false, 'pvc_card');
    expect(result.photosOmittedForConsent).toBe(0);
    expect(getHtml()).toContain('https://example.com/a.jpg');
    expect(getHtml()).not.toContain('Photo withheld');
  });

  it('a mixed batch only omits the withdrawn student and counts exactly that one', async () => {
    const withdrawnId = new Types.ObjectId().toHexString();
    const normalId = new Types.ObjectId().toHexString();
    const { svc } = build({ withdrawnStudentIds: new Set([withdrawnId]) });
    const result = await svc.generateIdCardsPdf(SCHOOL, undefined, 'student', [withdrawnId, normalId], undefined, false, 'pvc_card');
    expect(result.photosOmittedForConsent).toBe(1);
  });
});
