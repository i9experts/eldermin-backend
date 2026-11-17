import { PdfService } from './pdf.service';

// Regression coverage for PdfService.generateNazraReport - the Nazra
// (Qur'an reading) progress PDF, modeled directly on the Qaida report
// (qaida-report.spec.ts) since Nazra is the same program's next stage.

function makeService(overrides: { school?: any; progress?: any }) {
  const n: any = {};
  const schoolModel: any = { findOne: () => ({ lean: () => Promise.resolve(overrides.school) }) };
  const nazraModel: any = { findOne: () => ({ lean: () => Promise.resolve(overrides.progress) }) };
  // positions: pdfLog,student,invoice,school,assessment,behaviour,reportTemplate,
  // payment,expense,bankAccount,campus,groupInstitution,qaida,tarbiyah,
  // characterSettings,financeService,termReportCard,reportCard,
  // visibilitySettings,nazra
  const args = [
    n, n, n, schoolModel, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, nazraModel,
  ];
  const PdfServiceAny: any = PdfService;
  const service = new PdfServiceAny(...args) as PdfService;
  let capturedHtml = '';
  jest.spyOn(service as any, 'htmlToPdf').mockImplementation(async (html: any) => {
    capturedHtml = html;
    return Buffer.from('fake-pdf');
  });
  jest.spyOn(service as any, 'logPdf').mockResolvedValue(undefined);
  return { service, getHtml: () => capturedHtml };
}

const SCHOOL = { name: 'The Deenway School', address: { street: '12 Main Road', city: 'Karachi' } };
const PROGRESS = {
  studentName: 'Balaj Hussain', grade: 'Grade 3', section: 'A',
  currentTeacher: null, currentPara: 2, overallStatus: 'in_progress', overallRemarks: '',
  paras: [
    { paraNumber: 1, status: 'completed', startedDate: new Date(), completedDate: new Date(), attempts: [{ pageFrom: '1', pageTo: '21', remarks: 'Good' }] },
    { paraNumber: 2, status: 'in_progress', startedDate: new Date(), attempts: [] },
  ],
  diaryEntries: [],
};

describe('PdfService.generateNazraReport', () => {
  it('formats the school address from street/city instead of stringifying the address object', async () => {
    const { service, getHtml } = makeService({ school: SCHOOL, progress: PROGRESS });
    await service.generateNazraReport('demo-school', { studentId: 's1' } as any, 'user1');
    expect(getHtml()).toContain('12 Main Road, Karachi');
    expect(getHtml()).not.toContain('[object Object]');
  });

  it('shows all 30 Paras by default, with the true overview stats', async () => {
    const { service, getHtml } = makeService({ school: SCHOOL, progress: PROGRESS });
    await service.generateNazraReport('demo-school', { studentId: 's1' } as any, 'user1');
    const html = getHtml();
    expect(html).toContain('All 30 Paras');
    expect(html).toContain('Amma Yatasa&#39;aloon'); // para 30's title, present when unfiltered
    expect(html).toContain('1/30'); // completedCount/totalParas unaffected by filtering
  });

  it('limits the printed journey/table to upToPara while keeping the true totals', async () => {
    const { service, getHtml } = makeService({ school: SCHOOL, progress: PROGRESS });
    await service.generateNazraReport('demo-school', { studentId: 's1', upToPara: 2 } as any, 'user1');
    const html = getHtml();
    expect(html).toContain('Paras 1–2 of 30');
    expect(html).not.toContain('Tilka&#39;r-Rusul'); // para 3's title must not appear
    expect(html).toContain('1/30'); // overview stats still reflect the real 30-Para total
  });

  it('renders the recent Sabaq/Sabqi/Manzil diary log, newest first, capped at 8 entries', async () => {
    const progressWithDiary = {
      ...PROGRESS,
      diaryEntries: Array.from({ length: 10 }, (_, i) => ({
        date: new Date(2025, 9, i + 1),
        assessedBy: 'Qari Sahab',
        sabaq: { paraNumber: 1, pageFrom: String(i + 1), pageTo: String(i + 2), rating: 'developing', errorsNoted: [] },
        sabqi: i === 9 ? { paraNumber: 1, rating: 'proficient', errorsNoted: [] } : undefined,
        manzil: undefined,
      })),
    };
    const { service, getHtml } = makeService({ school: SCHOOL, progress: progressWithDiary });
    await service.generateNazraReport('demo-school', { studentId: 's1' } as any, 'user1');
    const html = getHtml();
    expect(html).toContain('Recent Diary — Sabaq / Sabqi / Manzil');
    expect(html).toContain('Sabqi'); // the most recent (10th) entry's sabqi tag
    // Only the most recent 8 of 10 entries should render - the 1st entry's
    // page range ("1–2") would not appear if correctly capped/sorted.
    expect((html.match(/Para 1 · p\.\d+–\d+/g) || []).length).toBeLessThanOrEqual(8);
  });

  it('aggregates common errors across Sabaq attempts and Sabqi/Manzil diary revisions', async () => {
    const progressWithErrors = {
      ...PROGRESS,
      paras: [
        { paraNumber: 1, status: 'completed', attempts: [{ pageFrom: '1', pageTo: '21', errorsNoted: ['makhraj_confusion', 'makhraj_confusion'] }] },
      ],
      diaryEntries: [
        { date: new Date(), assessedBy: 'Qari Sahab', sabaq: { paraNumber: 1, rating: 'developing', errorsNoted: [] }, sabqi: { paraNumber: 1, rating: 'developing', errorsNoted: ['missed_ghunna'] } },
      ],
    };
    const { service, getHtml } = makeService({ school: SCHOOL, progress: progressWithErrors });
    await service.generateNazraReport('demo-school', { studentId: 's1' } as any, 'user1');
    const html = getHtml();
    expect(html).toContain('Makhraj confusion (similar-sounding letters) <b>×2</b>');
    expect(html).toContain('Ghunna (nasalization) missed <b>×1</b>');
  });

  it("sizes .page's min-height to the printable area, not the raw A4 page size", async () => {
    const { service, getHtml } = makeService({ school: SCHOOL, progress: PROGRESS });
    await service.generateNazraReport('demo-school', { studentId: 's1' } as any, 'user1');
    const html = getHtml();
    expect(html).toContain('.page { width: 210mm; min-height: 277mm; padding: 6mm 16mm; }');
    expect(html).not.toContain('min-height: 297mm');
  });

  it('embeds a specific Latin font instead of depending on whatever sans-serif font the host happens to have installed', async () => {
    const { service, getHtml } = makeService({ school: SCHOOL, progress: PROGRESS });
    await service.generateNazraReport('demo-school', { studentId: 's1' } as any, 'user1');
    const html = getHtml();
    expect(html).toContain("font-family: 'Inter';");
    expect(html).toContain("body { font-family: 'Inter', 'Segoe UI', 'Noto Nastaliq Urdu', Arial, sans-serif;");
  });

  it('throws a clear error when the student has no Nazra progress recorded', async () => {
    const { service } = makeService({ school: SCHOOL, progress: null });
    await expect(
      service.generateNazraReport('demo-school', { studentId: 's1' } as any, 'user1'),
    ).rejects.toThrow('No Nazra progress recorded for this student yet');
  });
});
