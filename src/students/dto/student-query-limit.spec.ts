// Regression test for the "bulk fee assignment / bulk attendance / OMR
// roster shows 0 students" bug: several call sites legitimately request a
// whole class/section roster in one page (limit: 200-500), which used to
// exceed StudentQueryDto's @Max(100) and get rejected outright by the
// global ValidationPipe before the query ever ran - silently surfacing as
// "0 active students" in the UI (the failed query's `.data` just defaults
// to an empty array at every call site) rather than a visible error.
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { StudentQueryDto } from './student.dto';

async function validateLimit(limit: number) {
  const dto = plainToInstance(StudentQueryDto, { limit, grade: ['Grade 5'], status: 'active' });
  return validate(dto);
}

describe('StudentQueryDto limit', () => {
  it('accepts limit:500 (whole-class roster fetch, e.g. fee-assignment bulk preview)', async () => {
    const errors = await validateLimit(500);
    expect(errors).toHaveLength(0);
  });

  it('accepts limit:200 (attendance roll call / OMR roster fetch)', async () => {
    const errors = await validateLimit(200);
    expect(errors).toHaveLength(0);
  });

  it('still rejects an absurdly large limit as a sanity bound', async () => {
    const errors = await validateLimit(100000);
    expect(errors.some(e => e.property === 'limit')).toBe(true);
  });

  it('still rejects limit:0 as before', async () => {
    const errors = await validateLimit(0);
    expect(errors.some(e => e.property === 'limit')).toBe(true);
  });
});
