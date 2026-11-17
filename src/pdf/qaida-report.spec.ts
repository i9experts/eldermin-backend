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

  // A school reported this report still printing a near-empty 3rd page
  // (just "Areas Needing Attention" + the signature row) even after an
  // earlier proportional-spacing fix, because a real 16-row report with a
  // few recorded errors still carried more fixed content than that fix's
  // tuning accounted for. Rather than fragile math tuned to one overflow
  // amount, the whole template is simply laid out more densely - and
  // "Areas Needing Attention" is a single compact line instead of a row of
  // big rounded chips - so it reliably fits 2 pages regardless of content.
  it('uses the compact static spacing instead of the old wider values that bled onto a 3rd page', async () => {
    const { service, getHtml } = makeService({ school: SCHOOL, progress: PROGRESS });
    await service.generateQaidaReport('demo-school', { studentId: 's1' } as any, 'user1');
    const html = getHtml();
    expect(html).toContain('td { padding: 2.5px 8px; border-bottom: 1px solid #EAF5F0; vertical-align: top; }');
    expect(html).toContain('.sig-row { display: flex; justify-content: space-between; margin-top: 10px; padding-top: 5px; border-top: 1px solid #EADFC4; }');
    expect(html).not.toContain('margin-top: 34px');
    expect(html).not.toContain('margin-top: 16px; padding-top: 8px');
  });

  // The real root cause behind this report bleeding onto extra pages at
  // all, even before the compact-layout redesign above: htmlToPdf() prints
  // with a 10mm top + 10mm bottom Puppeteer page margin, so the printable
  // area per A4 page is only 277mm (297mm - 20mm), not the full 297mm -
  // but `.page` declared `min-height: 297mm`, forcing it 20mm taller than
  // what fits regardless of actual content, guaranteeing a near-blank
  // continuation page on every print.
  it("sizes .page's min-height to the printable area, not the raw A4 page size", async () => {
    const { service, getHtml } = makeService({ school: SCHOOL, progress: PROGRESS });
    await service.generateQaidaReport('demo-school', { studentId: 's1' } as any, 'user1');
    const html = getHtml();
    expect(html).toContain('.page { width: 210mm; min-height: 277mm; padding: 6mm 16mm; }');
    expect(html).not.toContain('min-height: 297mm');
  });

  it('renders "Areas Needing Attention" as a single compact line instead of a row of pill chips', async () => {
    const progressWithErrors = {
      ...PROGRESS,
      takhtis: [
        {
          takhtiNumber: 1, status: 'mastered', startedDate: new Date(), masteredDate: new Date(),
          attempts: [
            { remarks: 'Good', sabaqFrom: 'A', sabaqTo: 'B', errorsNoted: ['makhraj_confusion', 'makhraj_confusion', 'makhraj_confusion', 'makhraj_confusion'] },
          ],
        },
        {
          takhtiNumber: 2, status: 'in_progress', startedDate: new Date(),
          attempts: [
            { remarks: '', sabaqFrom: '', sabaqTo: '', errorsNoted: ['missed_ghunna', 'missed_ghunna', 'missed_ghunna'] },
          ],
        },
      ],
    };
    const { service, getHtml } = makeService({ school: SCHOOL, progress: progressWithErrors });
    await service.generateQaidaReport('demo-school', { studentId: 's1' } as any, 'user1');
    const html = getHtml();
    expect(html).toContain('<p class="error-note">Makhraj confusion (similar-sounding letters) <b>×4</b>, Ghunna (nasalization) missed <b>×3</b></p>');
    expect(html).not.toContain('error-chip');
    expect(html).not.toContain('error-list');
  });
});

describe('PdfService.generateQaidaReport - Urdu text rendering', () => {
  it('embeds the Noto Nastaliq Urdu font and wraps Urdu free text in dir="rtl", instead of rendering disconnected isolated glyphs in whatever font the container happens to have', async () => {
    const urduProgress = {
      ...PROGRESS,
      overallRemarks: 'شاباش، بہت اچھا کام',
      takhtis: [
        { takhtiNumber: 1, status: 'mastered', startedDate: new Date(), masteredDate: new Date(), attempts: [{ remarks: 'شاباش', sabaqFrom: 'A', sabaqTo: 'B' }] },
        { takhtiNumber: 2, status: 'in_progress', startedDate: new Date(), attempts: [] },
      ],
    };
    const { service, getHtml } = makeService({ school: SCHOOL, progress: urduProgress });
    await service.generateQaidaReport('demo-school', { studentId: 's1' } as any, 'user1');
    const html = getHtml();
    expect(html).toContain('@font-face');
    expect(html).toContain(`'Noto Nastaliq Urdu'`);
    expect(html).toContain(`<span dir="rtl">شاباش</span>`);
    expect(html).toContain(`<span dir="rtl">شاباش، بہت اچھا کام</span>`);
    // Every Takhti title's own Urdu rendering (titleUr) is also wrapped, not just free text
    expect(html).toMatch(/<div class="urdu"><span dir="rtl">.+<\/span><\/div>/);
  });
});
