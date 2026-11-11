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

  // A school reported this report printing with a near-empty 3rd page
  // holding only "Areas Needing Attention" + the signature row - wasteful
  // on a duplex (front/back) print, and the knock-on effect of the earlier
  // 2nd-page-margin fix slightly increasing the top/bottom margin on every
  // page. The full 16-Takhti table is a fixed size, so tightening the
  // header/student-box/section-title/table-row/signature-row spacing
  // reliably brings a full report back down to 2 pages.
  it('uses the tightened header/table-row/signature-row spacing instead of the old wider values that pushed a near-empty 3rd page', async () => {
    const { service, getHtml } = makeService({ school: SCHOOL, progress: PROGRESS });
    await service.generateQaidaReport('demo-school', { studentId: 's1' } as any, 'user1');
    const html = getHtml();
    expect(html).toContain('td { padding: 4px 10px; border-bottom: 1px solid #EAF5F0; vertical-align: top; }');
    expect(html).toContain('.sig-row { display: flex; justify-content: space-between; margin-top: 16px; padding-top: 8px; border-top: 1px solid #EADFC4; }');
    expect(html).not.toContain('margin-top: 34px');
  });

  // The 16-Takhti table is fixed in ROW COUNT, but a real student's
  // per-takhti teacher remarks, the "Areas Needing Attention" error chips,
  // and the overall-remarks paragraph are all genuinely variable-length
  // free text - unlike the short-remarks fixture above. A student with
  // longer recorded remarks on several takhtis, several common errors, and
  // a longer overall remark reported the report bleeding to a 3rd page
  // again, since the fixed trim above never accounted for that extra text.
  it('shrinks spacing further when per-takhti remarks, common errors, and the overall remark carry much more text than the short baseline', async () => {
    const verboseProgress = {
      ...PROGRESS,
      overallRemarks: 'Alhamdulillah, steady and consistent progress has been observed this term across every takhti attempted, though a little more revision is still recommended for the harder letter combinations before moving ahead.',
      commonErrors: [
        { error: 'makhraj_confusion', count: 4 },
        { error: 'missed_ghunna', count: 3 },
        { error: 'madd_too_short', count: 2 },
        { error: 'tashdeed_not_doubled', count: 2 },
      ],
      takhtis: [
        {
          takhtiNumber: 1, status: 'mastered', startedDate: new Date(), masteredDate: new Date(),
          attempts: [{ remarks: 'Good recitation overall but needs to slow down slightly on the longer words to avoid rushing through the harder combinations', sabaqFrom: 'Page 1', sabaqTo: 'Page 4' }],
        },
        {
          takhtiNumber: 2, status: 'in_progress', startedDate: new Date(),
          attempts: [{ remarks: 'Confuses a couple of similar-sounding letters when reading quickly, should practice isolated letter drills before the next attempt', sabaqFrom: 'Page 1', sabaqTo: 'Page 3' }],
        },
      ],
    };
    const { service, getHtml } = makeService({ school: SCHOOL, progress: verboseProgress });
    await service.generateQaidaReport('demo-school', { studentId: 's1' } as any, 'user1');
    const html = getHtml();
    expect(html).toMatch(/td \{ padding: (?!4px)[0-9.]+px 10px;/);
    expect(html).toMatch(/\.sig-row \{ display: flex; justify-content: space-between; margin-top: (?!16px)[0-9.]+px;/);
    expect(html).toMatch(/\.remarks-box \{ background: #FBF8F0; border: 1px solid #EADFC4; border-radius: 8px; padding: (?!14px)[0-9.]+px;/);
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
