import { describeSubjectBlockers, buildSubjectInUseMessage, SubjectRefCounts } from './subject-reference.util';

const zero: SubjectRefCounts = {
  curricula: 0, syllabi: 0, timetablePeriods: 0, electiveGroups: 0, subjectGroups: 0,
};

describe('describeSubjectBlockers', () => {
  it('returns no reasons when the subject is fully unreferenced', () => {
    expect(describeSubjectBlockers(zero)).toEqual([]);
  });

  it('describes a single blocker with correct singular wording', () => {
    expect(describeSubjectBlockers({ ...zero, curricula: 1 })).toEqual(['1 curriculum record']);
  });

  it('pluralizes correctly for counts above 1', () => {
    expect(describeSubjectBlockers({ ...zero, syllabi: 3 })).toEqual(['3 syllabus documents']);
  });

  it('lists every non-zero blocker together', () => {
    const reasons = describeSubjectBlockers({
      curricula: 2, syllabi: 1, timetablePeriods: 4, electiveGroups: 1, subjectGroups: 1,
    });
    expect(reasons).toEqual([
      '2 curriculum records',
      '1 syllabus document',
      '4 timetables with scheduled periods',
      '1 elective group',
      '1 subject group',
    ]);
  });
});

describe('buildSubjectInUseMessage', () => {
  it('joins the reasons into one clear error message', () => {
    const msg = buildSubjectInUseMessage(['2 curriculum records', '1 elective group']);
    expect(msg).toContain('2 curriculum records, 1 elective group');
    expect(msg).toContain('Cannot delete this subject');
  });
});
