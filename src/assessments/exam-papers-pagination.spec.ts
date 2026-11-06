import { AssessmentService } from './assessment.service';

// getExamPapers previously did an unbounded .find() with no page/limit/
// countDocuments at all - every exam paper and worksheet a school ever
// created loaded in one request, with no pager anywhere in the frontend to
// even reach a second page. This pins the fix: real page/limit/search
// support and a { data, meta } response shape, mirroring getQuestions.
describe('AssessmentService.getExamPapers', () => {
  const schoolSlug = 's1';

  function makePaper(overrides: Partial<any> = {}) {
    return {
      _id: 'p1', schoolSlug, title: 'Mid Term', subject: 'Math', grade: 'Grade 5',
      sections: [{ title: 'A', questionIds: [] }],
      ...overrides,
    };
  }

  function makeService(papers: any[], total: number) {
    const chain: any = {
      sort: () => chain,
      skip: () => chain,
      limit: () => chain,
      lean: async () => papers,
    };
    const noop: any = {};
    const examPaperModel: any = {
      find: jest.fn(() => chain),
      countDocuments: jest.fn(async () => total),
    };
    const questionModel: any = { find: jest.fn(() => ({ select: () => ({ lean: async () => [] }) })) };
    const service = new AssessmentService(
      noop, questionModel, noop, noop, examPaperModel, noop, noop,
      noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop,
    );
    return { service, examPaperModel };
  }

  it('returns a { data, meta } shape with a real total from countDocuments, not the fetched array length', async () => {
    const { service, examPaperModel } = makeService([makePaper()], 47);
    const result: any = await service.getExamPapers(schoolSlug, {});
    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual({ total: 47, page: 1, limit: 20, pages: 3 });
    expect(examPaperModel.countDocuments).toHaveBeenCalledWith(expect.objectContaining({ schoolSlug }));
  });

  it('defaults to page 1 / limit 20 when no page/limit is passed', async () => {
    const { service } = makeService([], 0);
    const result: any = await service.getExamPapers(schoolSlug, {});
    expect(result.meta.page).toBe(1);
    expect(result.meta.limit).toBe(20);
  });

  it('honors explicit page/limit and computes pages from them', async () => {
    const { service } = makeService([], 55);
    const result: any = await service.getExamPapers(schoolSlug, { page: 2, limit: 10 });
    expect(result.meta).toEqual({ total: 55, page: 2, limit: 10, pages: 6 });
  });

  it('filters by a case-insensitive title search', async () => {
    const { service, examPaperModel } = makeService([], 0);
    await service.getExamPapers(schoolSlug, { search: 'mid term' });
    const filter = examPaperModel.find.mock.calls[0][0];
    expect(filter.title).toEqual({ $regex: 'mid term', $options: 'i' });
  });

  it('still filters by subject/grade as before', async () => {
    const { service, examPaperModel } = makeService([], 0);
    await service.getExamPapers(schoolSlug, { subject: 'Math', grade: 'Grade 5' });
    const filter = examPaperModel.find.mock.calls[0][0];
    expect(filter.subject).toBe('Math');
    expect(filter.grade).toBe('Grade 5');
  });
});
