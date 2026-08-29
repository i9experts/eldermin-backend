import { buildSubjectCategoryInUseMessage } from './subject-category-reference.util';

describe('buildSubjectCategoryInUseMessage', () => {
  it('uses singular wording for a single subject', () => {
    const msg = buildSubjectCategoryInUseMessage(1);
    expect(msg).toContain('used by 1 subject');
    expect(msg).not.toContain('1 subjects');
  });

  it('pluralizes for counts above 1', () => {
    const msg = buildSubjectCategoryInUseMessage(4);
    expect(msg).toContain('used by 4 subjects');
  });

  it('names the reassign/deactivate remedy', () => {
    const msg = buildSubjectCategoryInUseMessage(2);
    expect(msg).toContain('Cannot delete this category');
    expect(msg).toContain('Reassign those subjects');
    expect(msg).toContain('deactivate the category instead');
  });
});
