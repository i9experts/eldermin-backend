import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateLeadDto, ConvertLeadDto } from './admissions.dto';

// Regression: the Add/Edit Lead and Convert-to-Applicant forms send
// assignedToId: '' when the "Assign To" dropdown is left unselected.
// @IsOptional() alone only skips validation for undefined/null, so
// @IsMongoId() rejected '' with "assignedToId must be a mongodb id" even
// though leaving a lead/application unassigned is a valid, common case.

function validLead(overrides: Record<string, any> = {}) {
  return {
    firstName: 'Ayesha',
    lastName: 'Khan',
    phone: '+923000000000',
    gradeInterested: 'Grade 1',
    source: 'website',
    ...overrides,
  };
}

function validConvert(overrides: Record<string, any> = {}) {
  return {
    gradeApplied: 'Grade 3',
    academicYear: '2026-27',
    dateOfBirth: '2024-02-07',
    gender: 'male',
    fatherName: 'Abdullah',
    ...overrides,
  };
}

describe('assignedToId empty-string tolerance', () => {
  it('CreateLeadDto accepts assignedToId: "" (no staff selected)', async () => {
    const dto = plainToInstance(CreateLeadDto, validLead({ assignedToId: '' }));
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.assignedToId).toBeUndefined();
  });

  it('CreateLeadDto still rejects a genuinely invalid id', async () => {
    const dto = plainToInstance(CreateLeadDto, validLead({ assignedToId: 'not-an-id' }));
    const errors = await validate(dto);
    expect(errors.some(e => e.property === 'assignedToId')).toBe(true);
  });

  it('ConvertLeadDto accepts assignedToId: "" (no staff selected)', async () => {
    const dto = plainToInstance(ConvertLeadDto, validConvert({ assignedToId: '' }));
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.assignedToId).toBeUndefined();
  });

  it('ConvertLeadDto accepts a real mongo id', async () => {
    const dto = plainToInstance(ConvertLeadDto, validConvert({ assignedToId: '507f1f77bcf86cd799439011' }));
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.assignedToId).toBe('507f1f77bcf86cd799439011');
  });
});
