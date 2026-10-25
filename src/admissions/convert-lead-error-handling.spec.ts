import { BadRequestException, ConflictException } from '@nestjs/common';
import { AdmissionsService } from './admissions.service';

// Regression test: converting a Lead to an Applicant could fail with a
// generic 500 "Internal server error" because convertLead's two Mongoose
// writes (`applicant.save()`, `lead.save()`) were never wrapped in a
// try/catch, so any ValidationError/CastError, or a random collision on the
// auto-generated `applicationNumber` (a random 4-digit suffix with a unique
// index), propagated uncaught to the global exception filter.

function mongoDuplicateKeyError() {
  const err: any = new Error('E11000 duplicate key error collection: eldermin.admission_applicants index: applicationNumber_1 dup key');
  err.code = 11000;
  return err;
}

function mongoValidationError() {
  const err: any = new Error('Applicant validation failed: gender: `other` is not a valid enum value');
  err.name = 'ValidationError';
  return err;
}

function makeLead(overrides: Record<string, any> = {}) {
  return {
    _id: 'lead1',
    firstName: 'Ali',
    lastName: 'Khan',
    email: 'ali@example.com',
    phone: '0300-1234567',
    assignedTo: 'Old Assignee',
    assignedToId: 'oldStaffId',
    status: 'new',
    convertedToApplicantId: undefined,
    lastContactedAt: undefined,
    save: jest.fn(async function (this: any) { return this; }),
    ...overrides,
  };
}

function makeApplicantModel({ saveImpl, saveAttempts }: {
  saveImpl?: (this: any) => Promise<any>;
  saveAttempts?: Array<() => Promise<any>>;
} = {}) {
  let callCount = 0;
  const ctor: any = jest.fn().mockImplementation(function (this: any, data: any) {
    Object.assign(this, data);
    this._id = 'applicant1';
    this.save = jest.fn(async function (this: any) {
      if (saveAttempts) {
        const impl = saveAttempts[Math.min(callCount, saveAttempts.length - 1)];
        callCount++;
        return impl.call(this);
      }
      if (saveImpl) return saveImpl.call(this);
      return this;
    });
  });
  return ctor;
}

function makeService({ leadModel, applicantModel }: { leadModel: any; applicantModel: any }) {
  const n: any = {};
  // Constructor order: leadModel, applicantModel, testModel, interviewModel,
  // enrollmentModel, retentionModel, studentsService.
  return new AdmissionsService(leadModel, applicantModel, n, n, n, n, n);
}

describe('AdmissionsService.convertLead: error handling', () => {
  it('converts a lead successfully, setting assignedTo and assignedToId from the dto', async () => {
    const lead = makeLead();
    const leadModel = { findOne: jest.fn(async () => lead) };
    const applicantModel = makeApplicantModel();
    const svc = makeService({ leadModel, applicantModel });

    const result = await svc.convertLead('lead1', 's', {
      gradeApplied: 'Grade 3',
      academicYear: '2026-27',
      dateOfBirth: '2018-06-12',
      gender: 'male',
      fatherName: 'Abdullah',
      motherName: 'Amina',
      campusId: 'campus1',
      assignedTo: 'Hiba Javaid',
      assignedToId: 'staff123',
      notes: 'Online test',
    } as any);

    expect(result.applicant.assignedTo).toBe('Hiba Javaid');
    expect(result.applicant.assignedToId).toBe('staff123');
    expect(lead.status).toBe('converted');
    expect(lead.save).toHaveBeenCalledTimes(1);
  });

  it('falls back to the lead\'s own assignedTo/assignedToId when the dto omits them', async () => {
    const lead = makeLead();
    const leadModel = { findOne: jest.fn(async () => lead) };
    const applicantModel = makeApplicantModel();
    const svc = makeService({ leadModel, applicantModel });

    const result = await svc.convertLead('lead1', 's', {
      gradeApplied: 'Grade 3',
      academicYear: '2026-27',
      dateOfBirth: '2018-06-12',
      gender: 'male',
      fatherName: 'Abdullah',
    } as any);

    expect(result.applicant.assignedTo).toBe('Old Assignee');
    expect(result.applicant.assignedToId).toBe('oldStaffId');
  });

  it('retries a random applicationNumber collision and succeeds within the retry budget', async () => {
    const lead = makeLead();
    const leadModel = { findOne: jest.fn(async () => lead) };
    const applicantModel = makeApplicantModel({
      saveAttempts: [
        async () => { throw mongoDuplicateKeyError(); },
        async function (this: any) { return this; },
      ],
    });
    const svc = makeService({ leadModel, applicantModel });

    const result = await svc.convertLead('lead1', 's', {
      gradeApplied: 'Grade 3',
      academicYear: '2026-27',
      dateOfBirth: '2018-06-12',
      gender: 'male',
      fatherName: 'Abdullah',
    } as any);

    expect(result.applicant).toBeDefined();
  });

  it('gives up with a clear ConflictException after exhausting retries on repeated collisions', async () => {
    const lead = makeLead();
    const leadModel = { findOne: jest.fn(async () => lead) };
    const applicantModel = makeApplicantModel({
      saveImpl: async () => { throw mongoDuplicateKeyError(); },
    });
    const svc = makeService({ leadModel, applicantModel });

    await expect(svc.convertLead('lead1', 's', {
      gradeApplied: 'Grade 3',
      academicYear: '2026-27',
      dateOfBirth: '2018-06-12',
      gender: 'male',
      fatherName: 'Abdullah',
    } as any)).rejects.toBeInstanceOf(ConflictException);
  });

  it('converts a Mongoose ValidationError into a clear 400, not a raw 500', async () => {
    const lead = makeLead();
    const leadModel = { findOne: jest.fn(async () => lead) };
    const applicantModel = makeApplicantModel({
      saveImpl: async () => { throw mongoValidationError(); },
    });
    const svc = makeService({ leadModel, applicantModel });

    await expect(svc.convertLead('lead1', 's', {
      gradeApplied: 'Grade 3',
      academicYear: '2026-27',
      dateOfBirth: '2018-06-12',
      gender: 'other',
      fatherName: 'Abdullah',
    } as any)).rejects.toBeInstanceOf(BadRequestException);
  });
});
