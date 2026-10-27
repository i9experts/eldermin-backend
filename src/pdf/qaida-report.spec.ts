import { PdfService } from './pdf.service';

// Pins two fixes to the Qaida & Tajweed PDF:
//  1. School.address is a structured sub-object, not a string - it used
//     to be interpolated directly into the template, printing the literal
//     text "[object Object]" under the school name on every real report.
//  2. An admin can now cap the printed Takhti listing (`upToTakhti`) so a
//     student who has only just started doesn't get a dozen-plus
//     "Not Started" rows - the overview stats stay against the true
//     16-takhti total either way.

function makeService(overrides: { school?: any; progress?: any }) {
  const n: any = {};
  const schoolModel: any = { findOne: () => ({ lean: () => Promise.resolve(overrides.school) }) };
  const qaidaModel: any = { findOne: () => ({ lean: () => Promise.resolve(overrides.progress) }) };
  const args = [
    n, n, n, schoolModel, n, n, n, n, n, n, n, n, qaidaModel, n, n, n,
  ];
  const PdfServiceAny: any = PdfService;
  const service = new PdfServiceAny(...args) as PdfService;
  let capturedHtml = '';
  jest.spyOn(service as any, 'htmlToPdf').mockImplementation(async (html: any) => {
    capturedHtml = html;
    return Buffer.from('fake-pdf');
  });
  return { service, getHtml: () => capturedHtml };
}

const SCHOOL = { name: 'The Deenway School', address: { street: '12 Main Road', city: 'Karachi' } };
const PROGRESS = {
  studentName: 'Balaj Hussain', grade: 'Pre K-2', section: 'Pre K-2B',
  currentTeacher: null, currentTakhti: 2, overallStatus: 'in_progress', overallRemarks: '',
  takhtis: [
    { takhtiNumber: 1, status: 'mastered', startedDate: new Date(), masteredDate: new Date(), attempts: [{ remarks: 'Good', sabaqFrom: 'A', sabaqTo: 'B' }] },
    { takhtiNumber: 2, status: 'in_progress', startedDate: new Date(), attempts: [] },
  ],
};

describe('PdfService.generateQaidaReport', () => {
  it('formats the school address from street/city instead of stringifying the address object', async () => {
    const { service, getHtml } = makeService({ school: SCHOOL, progress: PROGRESS });
    await service.generateQaidaReport('demo-school', { studentId: 's1' } as any, 'user1');
    expect(getHtml()).toContain('12 Main Road, Karachi');
    expect(getHtml()).not.toContain('[object Object]');
  });

  it('shows all 16 takhtis by default, with the true overview stats', async () => {
    const { service, getHtml } = makeService({ school: SCHOOL, progress: PROGRESS });
    await service.generateQaidaReport('demo-school', { studentId: 's1' } as any, 'user1');
    const html = getHtml();
    expect(html).toContain('All 16 Takhtis');
    expect(html).toContain('Tashdeed ba'); // takhti 16's title, present when unfiltered
    expect(html).toContain('1/16'); // masteredCount/totalTakhtis unaffected by filtering
  });

  it('limits the printed journey/table to upToTakhti while keeping the true totals', async () => {
    const { service, getHtml } = makeService({ school: SCHOOL, progress: PROGRESS });
    await service.generateQaidaReport('demo-school', { studentId: 's1', upToTakhti: 2 } as any, 'user1');
    const html = getHtml();
    expect(html).toContain('Takhtis 1–2 of 16');
    expect(html).not.toContain('Huroof-e-Muqatta'); // takhti 3's title must not appear
    expect(html).toContain('1/16'); // overview stats still reflect the real 16-takhti total
  });
});
