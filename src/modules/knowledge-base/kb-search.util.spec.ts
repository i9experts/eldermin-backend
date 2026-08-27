import { matchesKbQuery, normalizeQuery, searchKbArticles, buildKbSearchMongoFilter } from './kb-search.util';

describe('normalizeQuery', () => {
  it('trims and lowercases', () => {
    expect(normalizeQuery('  Payroll RUN  ')).toBe('payroll run');
  });
  it('turns null/undefined into empty string', () => {
    expect(normalizeQuery(undefined)).toBe('');
    expect(normalizeQuery(null)).toBe('');
  });
});

describe('matchesKbQuery', () => {
  const article = {
    title: 'Payroll',
    tagline: 'Define what staff are paid, run payroll monthly.',
    body: 'Payroll has three layers, in order: Salary Components...',
    steps: ['Set up Salary Components once', 'Each month, click + New Payroll Run'],
  };

  it('matches case-insensitively against the title', () => {
    expect(matchesKbQuery(article, 'PAYROLL')).toBe(true);
  });

  it('matches against tagline', () => {
    expect(matchesKbQuery(article, 'monthly')).toBe(true);
  });

  it('matches against body', () => {
    expect(matchesKbQuery(article, 'salary components')).toBe(true);
  });

  it('matches against individual steps', () => {
    expect(matchesKbQuery(article, 'new payroll run')).toBe(true);
  });

  it('returns false when nothing matches', () => {
    expect(matchesKbQuery(article, 'grievance')).toBe(false);
  });

  it('returns false for an empty query', () => {
    expect(matchesKbQuery(article, '')).toBe(false);
    expect(matchesKbQuery(article, '   ')).toBe(false);
  });

  it('handles an article with missing optional fields', () => {
    expect(matchesKbQuery({ title: 'Exit' }, 'exit')).toBe(true);
    expect(matchesKbQuery({}, 'exit')).toBe(false);
  });
});

describe('searchKbArticles', () => {
  const articles = [
    { title: 'Payroll', tagline: '', body: '', steps: [] },
    { title: 'Leave', tagline: 'Apply, approve leave', body: '', steps: [] },
    { title: 'Grievance', tagline: '', body: 'confidential channel', steps: [] },
  ];

  it('filters to only matching articles, preserving order', () => {
    expect(searchKbArticles(articles, 'leave').map((a) => a.title)).toEqual(['Leave']);
  });

  it('returns an empty array when nothing matches', () => {
    expect(searchKbArticles(articles, 'nonexistent')).toEqual([]);
  });

  it('returns an empty array for an empty query rather than everything', () => {
    expect(searchKbArticles(articles, '')).toEqual([]);
  });
});

describe('buildKbSearchMongoFilter', () => {
  it('builds a case-insensitive $or/regex filter across the four fields', () => {
    const filter = buildKbSearchMongoFilter('payroll');
    expect(filter.$or).toHaveLength(4);
    expect(filter.$or[0]).toEqual({ title: { $regex: 'payroll', $options: 'i' } });
  });

  it('escapes regex special characters in the query', () => {
    const filter = buildKbSearchMongoFilter('a+b?');
    expect(filter.$or[0].title.$regex).toBe('a\\+b\\?');
  });

  it('matches nothing for an empty query', () => {
    const filter = buildKbSearchMongoFilter('   ');
    expect(filter).toEqual({ _id: { $exists: false } });
  });
});
