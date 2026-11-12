import { PdfService } from './pdf.service';

// Guided Reading Phase 5 report - regression coverage for
// PdfService.generateGuidedReadingReport, modeled on nazra-report.spec.ts.

function makeService(overrides: { school?: any; student?: any; progress?: any; readers?: any[]; level?: any }) {
  const n: any = {};
  const studentModel: any = { findOne: () => ({ lean: () => Promise.resolve(overrides.student) }) };
  const schoolModel: any = { findOne: () => ({ lean: () => Promise.resolve(overrides.school) }) };
  const progressModel: any = { findOne: () => ({ lean: () => Promise.resolve(overrides.progress) }) };
  const readerModel: any = { find: () => ({ lean: () => Promise.resolve(overrides.readers || []) }) };
  const levelModel: any = { findOne: () => ({ lean: () => Promise.resolve(overrides.level) }) };
  // positions: pdfLog,student,invoice,school,assessment,behaviour,reportTemplate,
  // payment,expense,bankAccount,campus,groupInstitution,qaida,tarbiyah,
  // characterSettings,financeService,termReportCard,reportCard,
  // visibilitySettings,nazra,readingLevel,reader,readingProgress
  const args = [
    n, studentModel, n, schoolModel, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n,
    levelModel, readerModel, progressModel,
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
const STUDENT = { _id: 's1', firstName: 'Balaj', lastName: 'Hussain', currentGrade: 'Grade 3', currentSection: 'A' };
const LEVEL = { _id: 'level-1', name: 'Level 2' };
const READERS = [
  { _id: 'r1', title: 'The Big Apple', author: 'Jane Doe' },
  { _id: 'r2', title: 'My First Garden', author: 'John Smith' },
];
const PROGRESS = {
  currentLevelId: 'level-1',
  completedReaders: [
    { readerId: 'r1', completedAt: new Date('2026-01-10'), keywordsLookedUp: ['apple', 'round'], pointsAwarded: 15 },
    { readerId: 'r2', completedAt: new Date('2026-02-05'), keywordsLookedUp: ['garden'], pointsAwarded: 15 },
  ],
};

describe('PdfService.generateGuidedReadingReport', () => {
  it('formats the school address and renders the student/level summary', async () => {
    const { service, getHtml } = makeService({ school: SCHOOL, student: STUDENT, progress: PROGRESS, readers: READERS, level: LEVEL });
    await service.generateGuidedReadingReport('demo-school', { studentId: 's1' } as any, 'user1');
    const html = getHtml();
    expect(html).toContain('12 Main Road, Karachi');
    expect(html).toContain('Level 2');
    expect(html).toContain('Balaj Hussain');
  });

  it('lists completed readers newest-first with points and keyword counts', async () => {
    const { service, getHtml } = makeService({ school: SCHOOL, student: STUDENT, progress: PROGRESS, readers: READERS, level: LEVEL });
    await service.generateGuidedReadingReport('demo-school', { studentId: 's1' } as any, 'user1');
    const html = getHtml();
    const gardenIdx = html.indexOf('My First Garden');
    const appleIdx = html.indexOf('The Big Apple');
    expect(gardenIdx).toBeGreaterThan(-1);
    expect(appleIdx).toBeGreaterThan(-1);
    expect(gardenIdx).toBeLessThan(appleIdx); // newest completion (Feb) listed before the older one (Jan)
    expect(html).toContain('+15');
  });

  it('computes total points and deduplicated keyword count across readers', async () => {
    const { service, getHtml } = makeService({ school: SCHOOL, student: STUDENT, progress: PROGRESS, readers: READERS, level: LEVEL });
    await service.generateGuidedReadingReport('demo-school', { studentId: 's1' } as any, 'user1');
    const html = getHtml();
    expect(html).toContain('>30<'); // 15 + 15 total points
    expect(html).toContain('>3<'); // apple, round, garden - 3 distinct keywords
  });

  it('shows the Bookworm badge once at least one reader is completed', async () => {
    const { service, getHtml } = makeService({ school: SCHOOL, student: STUDENT, progress: PROGRESS, readers: READERS, level: LEVEL });
    await service.generateGuidedReadingReport('demo-school', { studentId: 's1' } as any, 'user1');
    expect(getHtml()).toContain('Bookworm');
  });

  it('shows no readers completed and no badges when nothing is completed yet', async () => {
    const { service, getHtml } = makeService({ school: SCHOOL, student: STUDENT, progress: { currentLevelId: 'level-1', completedReaders: [] }, readers: [], level: LEVEL });
    await service.generateGuidedReadingReport('demo-school', { studentId: 's1' } as any, 'user1');
    const html = getHtml();
    expect(html).toContain('No readers completed yet.');
    expect(html).not.toContain('Bookworm');
  });

  it('handles a student with no progress record at all (not yet assigned a level)', async () => {
    const { service, getHtml } = makeService({ school: SCHOOL, student: STUDENT, progress: null, readers: [], level: null });
    await service.generateGuidedReadingReport('demo-school', { studentId: 's1' } as any, 'user1');
    const html = getHtml();
    expect(html).toContain('Not assigned');
  });

  it('throws when the student does not exist for this school', async () => {
    const { service } = makeService({ school: SCHOOL, student: null });
    await expect(
      service.generateGuidedReadingReport('demo-school', { studentId: 's1' } as any, 'user1'),
    ).rejects.toThrow('Student not found');
  });
});
