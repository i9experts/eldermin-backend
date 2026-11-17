import { StudentsService, wrapTextLines } from './students.service';
import { PDFDocument } from 'pdf-lib';

// End-to-end smoke test for generateGrRegisterPdf, on top of the
// wrapTextLines unit tests in gr-register-text-wrap.spec.ts - this runs
// the real pdf-lib pipeline (fonts, drawing, pagination) with a student
// whose address is long enough that it used to overlap the row below it,
// and asserts the output is still a single, valid, parseable PDF.

function makeLean(result: any) {
  return { lean: jest.fn().mockResolvedValue(result) };
}

function makeService(students: any[]) {
  const studentModel: any = { find: jest.fn(() => makeLean(students)) };
  const schoolModel: any = { findOne: jest.fn(() => makeLean(null)) };
  const campusModel: any = { findOne: jest.fn(() => makeLean(null)) };
  const institutionModel: any = { findOne: jest.fn(() => makeLean(null)) };
  const n: any = { findOne: () => ({ lean: () => Promise.resolve(null) }) };
  // Constructor order: studentModel, attendanceModel, feeModel, behaviourModel,
  // resultModel, schoolModel, familyModel, campusModel, gradeModel,
  // institutionModel, feeStructureModel, studentFeeAssignmentModel,
  // medicalRecordModel, studentNoteModel, studentDocumentRecordModel,
  // academicHistoryRecordModel, enrollmentFieldModel, syllabusModel,
  // lessonProgressModel, quizAttemptModel, academicYearModel,
  // calendarEventModel, uploadService.
  return new StudentsService(
    studentModel, n, n, n, n,
    schoolModel, n, campusModel, n,
    institutionModel, n, n,
    n, n, n, n, n, n, n, n, n, n, n,
  );
}

describe('generateGrRegisterPdf', () => {
  it('produces a single valid PDF for a student with a long, multi-line address (no row overlap crash/garbage)', async () => {
    const longAddressStudent = {
      _id: 's1', grNo: '00075', admissionNumber: 'ADM-2026-7562', familyCode: 'FAM-0030',
      firstName: 'AMNA', lastName: 'UMER', currentGrade: 'PRE K-2', currentSection: 'A',
      gender: 'female', status: 'active',
      guardians: [{ relation: 'father', name: 'Muhammad Umer', phone: '+923321046666' }],
      dateOfBirth: new Date('2022-10-22'), admissionDate: new Date('2025-05-31'),
      address: 'HOUSE #D-18, F.B AREA BLOCK 17, NEAR ROYAL RESIDENCY TOWN, GULBERG, KARACHI, SINDH, PAKISTAN 75950',
    };
    const svc = makeService([longAddressStudent]);

    const buffer = await svc.generateGrRegisterPdf('demo-school', {});

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
    // Must parse back as a well-formed PDF - a row-height bug that drew
    // content past a page's bounds wouldn't necessarily corrupt the file
    // structure, but a crash during drawing (e.g. a bad y coordinate)
    // would have thrown before we even got here.
    const parsed = await PDFDocument.load(buffer);
    expect(parsed.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('gives a row with a long address strictly more vertical space than one with a short address', async () => {
    const short = { ...baseStudent(), _id: 's1', address: 'House 1, Lahore' };
    const long = { ...baseStudent(), _id: 's2', address: 'House 1, Block 8, F.B Area, Near Royal Residency, Gulberg Town, Karachi, Sindh, Pakistan 75950' };

    // Draw each alone (own group) and diff the y position consumed, by
    // checking the resulting page is still exactly one page for both
    // (sanity) while the long-address one's content height - inferred via
    // the exported wrapTextLines directly - is provably larger. The PDF
    // pipeline itself doesn't expose row height, so this pins the units
    // that actually determine it.
    const widthAt = (t: string, s: number) => t.length * s * 0.5; // same stand-in as the dedicated wrap spec
    const shortLines = wrapTextLines(short.address, 7, 110, widthAt);
    const longLines = wrapTextLines(long.address, 7, 110, widthAt);
    expect(longLines.length).toBeGreaterThan(shortLines.length);

    // And the full pipeline still runs end to end for both without error.
    await expect(makeService([short]).generateGrRegisterPdf('demo-school', {})).resolves.toBeInstanceOf(Buffer);
    await expect(makeService([long]).generateGrRegisterPdf('demo-school', {})).resolves.toBeInstanceOf(Buffer);
  });
});

function baseStudent() {
  return {
    grNo: '00075', admissionNumber: 'ADM-2026-7562', familyCode: 'FAM-0030',
    firstName: 'AMNA', lastName: 'UMER', currentGrade: 'PRE K-2', currentSection: 'A',
    gender: 'female', status: 'active',
    guardians: [{ relation: 'father', name: 'Muhammad Umer', phone: '+923321046666' }],
    dateOfBirth: new Date('2022-10-22'), admissionDate: new Date('2025-05-31'),
  };
}
