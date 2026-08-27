// ============================================================
// KB SEARCH UTIL — pure matching logic behind GET /kb/search
// Eldermin ERP
//
// Kept as a pure function (no Mongo) so the matching rules are unit
// testable without a database. The service also builds an equivalent
// case-insensitive $or/regex Mongo query (buildKbSearchMongoFilter)
// for the real query path — see knowledge-base.service.ts.
// ============================================================

export interface KbSearchable {
  title?: string;
  tagline?: string;
  body?: string;
  steps?: string[];
}

/** Normalizes a search query: trims and lowercases. Empty/whitespace-only becomes ''. */
export function normalizeQuery(q: string | undefined | null): string {
  return (q || '').trim().toLowerCase();
}

/**
 * Case-insensitive substring match across title, tagline, body, and each
 * step of an article. Empty query matches nothing (callers should treat
 * an empty query as "no search" rather than "match everything").
 */
export function matchesKbQuery(article: KbSearchable, rawQuery: string): boolean {
  const q = normalizeQuery(rawQuery);
  if (!q) return false;

  const haystacks: string[] = [
    article.title || '',
    article.tagline || '',
    article.body || '',
    ...(article.steps || []),
  ];

  return haystacks.some((h) => h.toLowerCase().includes(q));
}

/** Filters a list of articles by matchesKbQuery, preserving input order. */
export function searchKbArticles<T extends KbSearchable>(articles: T[], rawQuery: string): T[] {
  return articles.filter((a) => matchesKbQuery(a, rawQuery));
}

/**
 * Builds a case-insensitive Mongo $or/regex filter equivalent to
 * matchesKbQuery, for querying at the database layer instead of
 * loading every article into memory.
 */
export function buildKbSearchMongoFilter(rawQuery: string): Record<string, any> {
  const q = normalizeQuery(rawQuery);
  if (!q) return { _id: { $exists: false } }; // matches nothing

  // Escape regex special characters in the user-supplied query.
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = { $regex: escaped, $options: 'i' };

  return {
    $or: [{ title: re }, { tagline: re }, { body: re }, { steps: re }],
  };
}
