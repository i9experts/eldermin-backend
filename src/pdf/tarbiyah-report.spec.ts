import { PdfService } from './pdf.service';

// Regression coverage for PdfService.generateTarbiyahReport (the per-
// assessment "Report" PDF button on the Tarbiyah Student Assessments tab).
// A school reported a second printed page starting flush against the top
// of the paper instead of with a proper margin - caused by every PDF
// template baking its own top/bottom spacing into the HTML (.page/.content
// padding), which Chromium's print pagination only ever applies once, at
// the start of the whole continuous flow, never again at the top of a
// later physical page. Fixed by giving htmlToPdf() itself a real
// Puppeteer-level page margin (applied to EVERY physical page) and
// reducing each affected template's own padding by the same amount so a
// single-page document is unchanged.

function makeService(overrides: { school?: any; assessment?: any; characterSettings?: any }) {
  const n: any = {};
  const schoolModel: any = { findOne: () => ({ lean: () => Promise.resolve(overrides.school) }) };
  const tarbiyahModel: any = { findOne: () => ({ lean: () => Promise.resolve(overrides.assessment ?? null) }) };
  const characterSettingsModel: any = { findOne: () => ({ lean: () => Promise.resolve(overrides.characterSettings ?? null) }) };
  // positions: pdfLog,student,invoice,school,assessment,behaviour,reportTemplate,
  // payment,expense,bankAccount,campus,groupInstitution,qaida,tarbiyah,
  // characterSettings
  const args = [n, n, n, schoolModel, n, n, n, n, n, n, n, n, n, tarbiyahModel, characterSettingsModel];
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

const ASSESSMENT = {
  _id: 'ta1', studentName: 'Emaan Umair Khan', grade: 'Grade-4', section: 'A',
  period: 'Term 1 26-27', assessedBy: 'Alveena Khalid', assessmentDate: new Date('2026-11-10'),
  overallScore: 5, overallPercentage: 100, overallRating: 'excellent', parentShared: false,
  traits: [{ traitKey: 'sidq', score: 5, observation: 'Always speaks truthfully.' }],
  teacherObservations: 'MashaAllah a positive example.',
};

describe('PdfService.generateTarbiyahReport', () => {
  it('renders the student/grade/period/score', async () => {
    const { service, getHtml } = makeService({ school: SCHOOL, assessment: ASSESSMENT });
    await service.generateTarbiyahReport('demo-school', { assessmentId: 'ta1' } as any, 'user1');
    const html = getHtml();
    expect(html).toContain('Emaan Umair Khan');
    expect(html).toContain('Grade-4');
  });

  it('throws when the assessment does not exist', async () => {
    const { service } = makeService({ school: SCHOOL, assessment: null });
    await expect(service.generateTarbiyahReport('demo-school', { assessmentId: 'missing' } as any, 'user1'))
      .rejects.toThrow('Tarbiyah assessment not found');
  });

  it('uses the reduced top/bottom page padding, now that htmlToPdf applies a real Puppeteer page margin on every physical page instead', async () => {
    const { service, getHtml } = makeService({ school: SCHOOL, assessment: ASSESSMENT });
    await service.generateTarbiyahReport('demo-school', { assessmentId: 'ta1' } as any, 'user1');
    const html = getHtml();
    expect(html).toContain('.page { width: 210mm; min-height: 277mm; padding: 6mm 16mm; }');
    expect(html).not.toContain('padding: 16mm; }');
  });

  // A school's Qaida report (the same shared layout as this template)
  // spilled a near-empty trailing page holding only "Areas Needing
  // Attention" + the signature row, wasting a sheet when duplex-printed.
  // Its header/student-box/section-title/table-row/signature-row spacing
  // was trimmed throughout (same change applied to QAIDA_REPORT_TEMPLATE
  // and TARBIYAH_AGGREGATE_REPORT_TEMPLATE, which share this CSS) so a
  // fixed-size document like this one reliably fits without a trailing page.
  it('uses the tightened header/table-row/signature-row spacing', async () => {
    const { service, getHtml } = makeService({ school: SCHOOL, assessment: ASSESSMENT });
    await service.generateTarbiyahReport('demo-school', { assessmentId: 'ta1' } as any, 'user1');
    const html = getHtml();
    expect(html).toContain('td { padding: 4px 10px; border-bottom: 1px solid #EEF2F8; vertical-align: top; }');
    expect(html).toContain('.sig-row { display: flex; justify-content: space-between; margin-top: 16px; padding-top: 8px; border-top: 1px solid #EEF2F8; }');
    expect(html).not.toContain('margin-top: 34px');
  });
});
