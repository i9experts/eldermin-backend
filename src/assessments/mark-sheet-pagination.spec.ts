import { Types } from 'mongoose';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AssessmentService } from './assessment.service';
import { MarkQueryDto } from './dto/assessment.dto';

// Pins the fix for "teachers entered 30 students' marks but the Mark Sheet
// only shows 20, with no way to reach the rest" - PaginationDto's generic
// default (limit: 20) silently truncated a single-request "whole class
// roster" listing that has no pagination control on screen, corrupting
// the Total/Entered/Pass/Fail/Absent/Avg% summary cards along with it.
// MarkQueryDto now overrides that default to comfortably cover a full
// class (or an "All sections" merged grade) in one request.

function makeChain(result: any) {
  const c: any = {
    sort: () => c,
    skip: () => c,
    limit: () => c,
    lean: () => Promise.resolve(result),
    then: (res: any, rej: any) => Promise.resolve(result).then(res, rej),
  };
  return c;
}

function makeService(markModel: any) {
  const noop: any = {};
  return new AssessmentService(
    noop, noop, markModel, noop, noop, noop, noop,
    noop, noop, noop, noop, noop, noop, noop, noop,
    noop, noop, noop,
  );
}

describe('MarkQueryDto defaults', () => {
  it('defaults limit to 2000, not PaginationDto\'s generic 20', () => {
    const dto = plainToInstance(MarkQueryDto, {});
    expect(dto.limit).toBe(2000);
  });

  it('still honours an explicit smaller limit', () => {
    const dto = plainToInstance(MarkQueryDto, { limit: '10' });
    expect(dto.limit).toBe(10);
  });

  it('rejects a limit above the 2000 safety cap', async () => {
    const dto = plainToInstance(MarkQueryDto, { limit: '5000' });
    const errors = await validate(dto);
    expect(errors.some(e => e.property === 'limit')).toBe(true);
  });
});

describe('AssessmentService.getMarks', () => {
  it('returns every mark in a 30-student class, not just the first 20', async () => {
    const marks = Array.from({ length: 30 }, (_, i) => ({
      _id: new Types.ObjectId(), studentName: `Student ${i}`, rollNumber: i + 1,
    }));
    const markModel: any = {
      find: jest.fn(() => makeChain(marks)),
      countDocuments: jest.fn().mockResolvedValue(30),
    };
    const service = makeService(markModel);

    const dto = plainToInstance(MarkQueryDto, { assessmentId: new Types.ObjectId().toString() });
    const result = await service.getMarks('school-a', dto);

    expect(result.data).toHaveLength(30);
    expect(result.meta.total).toBe(30);
  });
});
