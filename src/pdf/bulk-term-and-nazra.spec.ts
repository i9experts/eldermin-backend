import { PdfService } from './pdf.service';
import { PDFDocument } from 'pdf-lib';

// Regression coverage for PdfService.generateBulkTermReportCardsPdf and
// generateBulkNazraReportsPdf - the "Download All" bulk-PDF options added
// to the Results tab's Whole Term view and the Nazra class roster,
// modeled on generateBulkExamReportCardsPdf's pdf-lib merge pattern
// (see exam-report-card.spec.ts).

// The merge step loads each student's PDF with pdf-lib, so the mocked
// htmlToPdf has to return bytes pdf-lib can actually load.
async function fakePdfBuffer(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  return Buffer.from(await doc.save());
}

const SCHOOL = { name: 'The Deenway School', address: { street: '12 Main Road', city: 'Karachi' } };

function makeTermService(cards: any[]) {
  const n: any = {};
  const studentModel: any = {
    findOne: (filter: any) => ({
      lean: () => Promise.resolve({ _id: filter._id, firstName: 'Student', lastName: String(filter._id) }),
    }),
  };
  const schoolModel: any = { findOne: () => ({ lean: () => Promise.resolve(SCHOOL) }) };
  const termReportCardModel: any = {
    find: (filter: any) => ({
      sort: () => ({
        select: () => ({
          lean: () => Promise.resolve(cards.filter((c) => {
            if (filter.term && c.term !== filter.term) return false;
            if (filter.section && c.section !== filter.section) return false;
            return true;
          })),
        }),
      }),
    }),
    findOne: (filter: any) => ({
      sort: () => ({
        lean: () => Promise.resolve(
          cards.find((c) => String(c.studentId) === String(filter.studentId) && c.academicYear === filter.academicYear) || null,
        ),
      }),
    }),
  };
  // positions: pdfLog,student,invoice,school,assessment,behaviour,reportTemplate,
  // payment,expense,bankAccount,campus,groupInstitution,qaida,tarbiyah,
  // characterSettings,financeService,termReportCard,reportCard,visibilitySettings
  const args = [n, studentModel, n, schoolModel, n, n, n, n, n, n, n, n, n, n, n, n, termReportCardModel, n, undefined];
  const PdfServiceAny: any = PdfService;
  const service = new PdfServiceAny(...args) as PdfService;
  jest.spyOn(service as any, 'htmlToPdf').mockImplementation(async () => fakePdfBuffer());
  jest.spyOn(service as any, 'logPdf').mockResolvedValue(undefined);
  return { service };
}

function makeNazraService(progresses: any[]) {
  const n: any = {};
  const schoolModel: any = { findOne: () => ({ lean: () => Promise.resolve(SCHOOL) }) };
  const nazraModel: any = {
    find: (filter: any) => ({
      sort: () => ({
        select: () => ({
          lean: () => Promise.resolve(progresses.filter((p) => {
            if (filter.grade && p.grade !== filter.grade) return false;
            if (filter.section && p.section !== filter.section) return false;
            return true;
          })),
        }),
      }),
    }),
    findOne: (filter: any) => ({
      lean: () => Promise.resolve(progresses.find((p) => String(p.studentId) === String(filter.studentId)) || null),
    }),
  };
  // positions: pdfLog,student,invoice,school,assessment,behaviour,reportTemplate,
  // payment,expense,bankAccount,campus,groupInstitution,qaida,tarbiyah,
  // characterSettings,financeService,termReportCard,reportCard,
  // visibilitySettings,nazra
  const args = [n, n, n, schoolModel, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, nazraModel];
  const PdfServiceAny: any = PdfService;
  const service = new PdfServiceAny(...args) as PdfService;
  jest.spyOn(service as any, 'htmlToPdf').mockImplementation(async () => fakePdfBuffer());
  jest.spyOn(service as any, 'logPdf').mockResolvedValue(undefined);
  return { service };
}

const makeTermCard = (overrides: any) => ({
  studentId: overrides.studentId, academicYear: '2025-26', term: 'Term 1',
  studentName: overrides.studentName, rollNumber: overrides.rollNumber,
  grade: 'Grade 3', section: overrides.section,
  subjects: [{ subject: 'Math', obtainedMarks: 85, totalMarks: 100, percentage: 85, grade: 'A' }],
  totalObtainedMarks: 85, totalMaxMarks: 100, overallPercentage: 85, overallGrade: 'A', overallGPA: 3.7,
  overallResult: 'pass', classPosition: 1, totalStudents: 3,
  sectionsIncluded: {},
  ...overrides,
});

const TERM_CARDS = [
  makeTermCard({ studentId: 's1', studentName: 'Ayesha Khan', rollNumber: 'R-101', section: 'A' }),
  makeTermCard({ studentId: 's2', studentName: 'Bilal Ahmed', rollNumber: 'R-102', section: 'A', term: 'Term 2' }),
  makeTermCard({ studentId: 's3', studentName: 'Sara Malik', rollNumber: 'R-103', section: 'B' }),
];

describe('PdfService.generateBulkTermReportCardsPdf', () => {
  it('merges every matching term report card into one combined PDF', async () => {
    const { service } = makeTermService(TERM_CARDS);
    const pdf = await service.generateBulkTermReportCardsPdf('demo-school', {} as any, 'user1');
    const merged = await PDFDocument.load(pdf);
    expect(merged.getPageCount()).toBe(3);
  });

  it('narrows the merge to a specific term', async () => {
    const { service } = makeTermService(TERM_CARDS);
    const pdf = await service.generateBulkTermReportCardsPdf('demo-school', { term: 'Term 1' } as any, 'user1');
    const merged = await PDFDocument.load(pdf);
    expect(merged.getPageCount()).toBe(2);
  });

  it('narrows the merge to a specific section', async () => {
    const { service } = makeTermService(TERM_CARDS);
    const pdf = await service.generateBulkTermReportCardsPdf('demo-school', { section: 'B' } as any, 'user1');
    const merged = await PDFDocument.load(pdf);
    expect(merged.getPageCount()).toBe(1);
  });

  it('throws a clear error instead of generating anything when no term report cards match', async () => {
    const { service } = makeTermService(TERM_CARDS);
    await expect(
      service.generateBulkTermReportCardsPdf('demo-school', { term: 'Term 3' } as any, 'user1'),
    ).rejects.toThrow('No term report cards match these filters.');
  });

  it('refuses a batch larger than the configured cap instead of silently rendering all of it', async () => {
    const manyCards = Array.from({ length: 101 }, (_, i) =>
      makeTermCard({ studentId: `s${i}`, studentName: `Student ${i}`, rollNumber: `R-${i}`, section: 'A' }));
    const { service } = makeTermService(manyCards);
    await expect(
      service.generateBulkTermReportCardsPdf('demo-school', {} as any, 'user1'),
    ).rejects.toThrow(/narrow them/);
  });
});

const makeNazraProgress = (overrides: any) => ({
  studentId: overrides.studentId, studentName: overrides.studentName,
  grade: overrides.grade, section: overrides.section,
  currentTeacher: null, currentPara: 2, overallStatus: 'in_progress', overallRemarks: '',
  paras: [], diaryEntries: [],
  ...overrides,
});

const NAZRA_PROGRESSES = [
  makeNazraProgress({ studentId: 'n1', studentName: 'Ayesha Khan', grade: 'Grade 3', section: 'A' }),
  makeNazraProgress({ studentId: 'n2', studentName: 'Bilal Ahmed', grade: 'Grade 3', section: 'B' }),
  makeNazraProgress({ studentId: 'n3', studentName: 'Sara Malik', grade: 'Grade 4', section: 'A' }),
];

describe('PdfService.generateBulkNazraReportsPdf', () => {
  it('merges every tracked student in the class into one combined PDF', async () => {
    const { service } = makeNazraService(NAZRA_PROGRESSES);
    const pdf = await service.generateBulkNazraReportsPdf('demo-school', { grade: 'Grade 3' } as any, 'user1');
    const merged = await PDFDocument.load(pdf);
    expect(merged.getPageCount()).toBe(2);
  });

  it('narrows the merge to a specific section', async () => {
    const { service } = makeNazraService(NAZRA_PROGRESSES);
    const pdf = await service.generateBulkNazraReportsPdf('demo-school', { grade: 'Grade 3', section: 'A' } as any, 'user1');
    const merged = await PDFDocument.load(pdf);
    expect(merged.getPageCount()).toBe(1);
  });

  it('throws a clear error instead of generating anything when no students are tracked in this class yet', async () => {
    const { service } = makeNazraService(NAZRA_PROGRESSES);
    await expect(
      service.generateBulkNazraReportsPdf('demo-school', { grade: 'Grade 9' } as any, 'user1'),
    ).rejects.toThrow('No Nazra progress recorded for this class yet.');
  });

  it('refuses a batch larger than the configured cap instead of silently rendering all of it', async () => {
    const manyProgresses = Array.from({ length: 101 }, (_, i) =>
      makeNazraProgress({ studentId: `n${i}`, studentName: `Student ${i}`, grade: 'Grade 3', section: 'A' }));
    const { service } = makeNazraService(manyProgresses);
    await expect(
      service.generateBulkNazraReportsPdf('demo-school', { grade: 'Grade 3' } as any, 'user1'),
    ).rejects.toThrow(/narrow it/);
  });

  it('throws when Nazra progress tracking is not available on this deployment', async () => {
    const n: any = {};
    const schoolModel: any = { findOne: () => ({ lean: () => Promise.resolve(SCHOOL) }) };
    const args = [n, n, n, schoolModel, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, undefined];
    const PdfServiceAny: any = PdfService;
    const service = new PdfServiceAny(...args) as PdfService;
    await expect(
      service.generateBulkNazraReportsPdf('demo-school', { grade: 'Grade 3' } as any, 'user1'),
    ).rejects.toThrow('Nazra progress tracking is not available.');
  });
});
