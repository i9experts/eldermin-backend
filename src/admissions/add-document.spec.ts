import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdmissionsService } from './admissions.service';

// Regression/feature test: "+ Add Document" on an Applicant's detail view
// was a frontend stub with no backend endpoint behind it at all. This covers
// the new AdmissionsService.addDocument method, which uploads the file via
// UploadService and pushes a SubmittedDocument record onto the applicant.

const APPLICANT_ID = '507f1f77bcf86cd799439011';

function makeApplicant(overrides: Record<string, any> = {}) {
  return {
    _id: APPLICANT_ID,
    documents: [],
    save: jest.fn(async function (this: any) { return this; }),
    ...overrides,
  };
}

function makeService({ applicantModel, uploadService }: { applicantModel: any; uploadService: any }) {
  const n: any = {};
  // Constructor order: leadModel, applicantModel, testModel, interviewModel,
  // enrollmentModel, retentionModel, studentsService, uploadService.
  return new AdmissionsService(n, applicantModel, n, n, n, n, n, uploadService);
}

const FAKE_FILE = {
  originalname: 'transcript.pdf',
  mimetype: 'application/pdf',
  size: 1024,
  buffer: Buffer.from('fake'),
} as any;

describe('AdmissionsService.addDocument', () => {
  it('uploads the file and pushes a new document onto the applicant', async () => {
    const applicant = makeApplicant();
    const applicantModel = { findOne: jest.fn(async () => applicant) };
    const uploadService = {
      uploadFile: jest.fn(async () => ({
        url: 'https://bucket.s3.amazonaws.com/school/applicant-documents/abc.pdf',
        key: 'school/applicant-documents/abc.pdf',
        fileName: 'transcript.pdf',
        fileSize: 1024,
        fileType: 'application/pdf',
      })),
    };
    const svc = makeService({ applicantModel, uploadService });

    const result = await svc.addDocument(APPLICANT_ID, 's', FAKE_FILE, 'Transcript', 'academic');

    expect(uploadService.uploadFile).toHaveBeenCalledWith(FAKE_FILE, 'applicant-documents', 's');
    expect(applicant.documents).toHaveLength(1);
    expect(applicant.documents[0]).toMatchObject({
      name: 'Transcript',
      type: 'academic',
      status: 'pending',
      fileUrl: 'https://bucket.s3.amazonaws.com/school/applicant-documents/abc.pdf',
    });
    expect(applicant.save).toHaveBeenCalled();
    expect(result).toBe(applicant);
  });

  it('falls back to the file name when no document name is given', async () => {
    const applicant = makeApplicant();
    const applicantModel = { findOne: jest.fn(async () => applicant) };
    const uploadService = {
      uploadFile: jest.fn(async () => ({ url: 'https://x/y.pdf' })),
    };
    const svc = makeService({ applicantModel, uploadService });

    await svc.addDocument(APPLICANT_ID, 's', FAKE_FILE, '', '');

    expect(applicant.documents[0]).toMatchObject({ name: 'transcript.pdf', type: 'other' });
  });

  it('rejects a malformed applicant id without touching the database', async () => {
    const applicantModel = { findOne: jest.fn() };
    const uploadService = { uploadFile: jest.fn() };
    const svc = makeService({ applicantModel, uploadService });

    await expect(svc.addDocument('not-an-id', 's', FAKE_FILE, 'Doc', 'other'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(applicantModel.findOne).not.toHaveBeenCalled();
    expect(uploadService.uploadFile).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the applicant does not exist', async () => {
    const applicantModel = { findOne: jest.fn(async () => null) };
    const uploadService = { uploadFile: jest.fn() };
    const svc = makeService({ applicantModel, uploadService });

    await expect(svc.addDocument(APPLICANT_ID, 's', FAKE_FILE, 'Doc', 'other'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(uploadService.uploadFile).not.toHaveBeenCalled();
  });
});
