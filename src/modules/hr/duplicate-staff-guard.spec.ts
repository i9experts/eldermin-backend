import { ConflictException } from '@nestjs/common';
import { HrService } from './hr.service';

// Pins the fix for teachers appearing twice in the Teacher Directory
// (one populated row, one blank) - traced back to createStaff never
// checking for an existing Staff record before inserting a new one.
// Re-entering the same person (matched here by email) is now blocked
// with a clear error instead of silently creating a duplicate.

function svc(staffModel: any) {
  const s: any = Object.create(HrService.prototype);
  s.staffModel = staffModel;
  s.newTid = (t: string) => t;
  return s as HrService;
}

describe('HrService.createStaff — duplicate detection', () => {
  it('rejects a new staff member whose email matches an existing one (case-insensitive)', async () => {
    const existing = { firstName: 'Zaryab', lastName: 'Akram', employeeId: 'EMP-010' };
    const staffModel: any = {
      findOne: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve(existing) }) })),
      create: jest.fn(),
    };

    await expect(
      svc(staffModel).createStaff('tenantA', { firstName: 'Zaryab', lastName: 'Akram', email: 'Zaryab.Akram@School.Edu' }),
    ).rejects.toThrow(ConflictException);
    expect(staffModel.create).not.toHaveBeenCalled();
  });

  it('allows creation when no staff with that email exists yet', async () => {
    const staffModel: any = {
      findOne: jest.fn((filter: any) => {
        // email-duplicate check
        if (filter.email) return { select: () => ({ lean: () => Promise.resolve(null) }) };
        // employeeId auto-generation lookup
        return { sort: () => ({ lean: () => Promise.resolve(null) }) };
      }),
      create: jest.fn((d: any) => Promise.resolve(d)),
    };

    const result: any = await svc(staffModel).createStaff('tenantA', { firstName: 'New', lastName: 'Teacher', email: 'new.teacher@school.edu' });

    expect(staffModel.create).toHaveBeenCalledTimes(1);
    expect(result.email).toBe('new.teacher@school.edu');
  });

  it('skips the duplicate check entirely when no email is given (unchanged behavior)', async () => {
    const staffModel: any = {
      findOne: jest.fn(() => ({ sort: () => ({ lean: () => Promise.resolve(null) }) })),
      create: jest.fn((d: any) => Promise.resolve(d)),
    };

    await svc(staffModel).createStaff('tenantA', { firstName: 'No', lastName: 'Email' });

    expect(staffModel.create).toHaveBeenCalledTimes(1);
  });
});
