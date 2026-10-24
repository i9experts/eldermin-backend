import { Types } from 'mongoose';
import { AssessmentService } from './assessment.service';
import { BadRequestException, ConflictException } from '@nestjs/common';

// createExamPaper/updateExamPaper previously had no try/catch around their
// writes, so a raw Mongoose ValidationError/CastError or a duplicate-key
// error propagated straight to the global SentryExceptionFilter, which
// stringifies any non-HttpException into a generic "Internal server error"
// (500) - exactly the symptom a user reported on "Create Paper". These
// tests confirm both methods now convert those known error classes into
// clear, actionable HTTP exceptions instead, mirroring the same pattern
// already used elsewhere in this codebase (e.g. TeachingService).
describe('AssessmentService: createExamPaper/updateExamPaper error handling', () => {
  const schoolSlug = 's1';
  const createdBy = new Types.ObjectId().toString();

  function makeService(opts: {
    saveImpl?: () => Promise<any>;
    findOneAndUpdateImpl?: () => Promise<any>;
    questionCount?: number;
  } = {}) {
    const noop: any = {};
    const saveImpl = opts.saveImpl ?? (async function (this: any) { return this; });

    // examPaperModel must be usable both as `new this.examPaperModel(...)`
    // (createExamPaper) and as an object with findOneAndUpdate
    // (updateExamPaper) - mirror that dual shape here.
    function ExamPaperModelCtor(this: any, doc: any) {
      Object.assign(this, doc);
      this.save = saveImpl.bind(this);
    }
    (ExamPaperModelCtor as any).findOneAndUpdate = jest.fn(
      opts.findOneAndUpdateImpl ?? (async () => ({ _id: 'p1', ...{} })),
    );

    const questionModel: any = { countDocuments: jest.fn(async () => opts.questionCount ?? 0) };

    const service = new AssessmentService(
      noop, questionModel, noop, noop, ExamPaperModelCtor as any, noop, noop,
      noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop,
    );
    return { service };
  }

  describe('createExamPaper', () => {
    const dto = { title: 'Mid Term', sections: [{ title: 'A', questionIds: [] }] };

    it('converts a Mongoose ValidationError into a BadRequestException instead of a raw 500', async () => {
      const err: any = new Error('Paper validation failed: title: Path `title` is required.');
      err.name = 'ValidationError';
      const { service } = makeService({ saveImpl: async () => { throw err; } });
      await expect(service.createExamPaper(schoolSlug, createdBy, dto)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('converts a Mongoose CastError into a BadRequestException instead of a raw 500', async () => {
      const err: any = new Error('Cast to ObjectId failed');
      err.name = 'CastError';
      const { service } = makeService({ saveImpl: async () => { throw err; } });
      await expect(service.createExamPaper(schoolSlug, createdBy, dto)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('converts a duplicate-key error (paperCode collision) into a ConflictException instead of a raw 500', async () => {
      const err: any = new Error('E11000 duplicate key error');
      err.code = 11000;
      const { service } = makeService({ saveImpl: async () => { throw err; } });
      await expect(service.createExamPaper(schoolSlug, createdBy, dto)).rejects.toBeInstanceOf(ConflictException);
    });

    it('lets an unrelated/unexpected error continue to propagate unchanged', async () => {
      const err = new Error('disk full');
      const { service } = makeService({ saveImpl: async () => { throw err; } });
      await expect(service.createExamPaper(schoolSlug, createdBy, dto)).rejects.toBe(err);
    });

    it('a normal successful creation (multi-section, mixed question types) is unaffected', async () => {
      const { service } = makeService({ questionCount: 2 });
      const mixedDto = {
        title: 'Finals',
        sections: [
          { title: 'MCQ', questionIds: [new Types.ObjectId().toString()] },
          { title: 'Matching', questionIds: [new Types.ObjectId().toString()] },
        ],
      };
      const result: any = await service.createExamPaper(schoolSlug, createdBy, mixedDto);
      expect(result.title).toBe('Finals');
      expect(result.schoolSlug).toBe(schoolSlug);
      expect(result.paperCode).toMatch(/^PAPER-/);
    });
  });

  describe('updateExamPaper', () => {
    const id = new Types.ObjectId().toString();

    it('converts a Mongoose ValidationError into a BadRequestException instead of a raw 500', async () => {
      const err: any = new Error('validation failed');
      err.name = 'ValidationError';
      const { service } = makeService({ findOneAndUpdateImpl: async () => { throw err; } });
      await expect(service.updateExamPaper(id, schoolSlug, { title: 'x' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('converts a duplicate-key error into a ConflictException instead of a raw 500', async () => {
      const err: any = new Error('E11000 duplicate key error');
      err.code = 11000;
      const { service } = makeService({ findOneAndUpdateImpl: async () => { throw err; } });
      await expect(service.updateExamPaper(id, schoolSlug, { paperCode: 'DUP' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('a normal successful update is unaffected', async () => {
      const { service } = makeService({ findOneAndUpdateImpl: async () => ({ _id: id, title: 'Updated' }) });
      const result: any = await service.updateExamPaper(id, schoolSlug, { title: 'Updated' });
      expect(result.title).toBe('Updated');
    });
  });
});
