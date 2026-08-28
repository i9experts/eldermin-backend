// Pure, framework-free helper for deduplicating a Student's embedded
// guardians[] array. Used from both StudentsService.deduplicateGuardians
// (the one-time/repeatable cleanup pass) and StudentsService.updateStudent
// (the generic PUT /students/:id path, which is the second write path that
// let duplicate guardian rows slip through without going via
// addGuardianToStudent's dedicated duplicate check) - kept as one shared
// implementation so the three guardian write/cleanup paths never drift into
// three slightly different definitions of "same guardian".
//
// Identity: same phone number = same guardian. If neither entry being
// compared has a phone on record, fall back to a case-insensitive name
// match - the same rule addGuardianToStudent's guard already uses.
//
// This only ever collapses entries that are duplicates *within the same
// student's own guardians[] array* - it never looks across students, so a
// guardian legitimately linked to two different children (siblings) is
// completely unaffected.

export interface GuardianLike {
  name?: string;
  relation?: string;
  phone?: string;
  email?: string;
  occupation?: string;
  employer?: string;
  isPrimary?: boolean;
  isEmergencyContact?: boolean;
  [key: string]: any;
}

/** Dedupe key for a guardian entry: trimmed phone if present, else a
 * case-insensitive name key. Two entries with the same key are considered
 * the same real person for the purposes of one student's guardians[]. */
export function guardianDedupeKey(g: GuardianLike): string {
  const phone = (g?.phone || '').trim();
  if (phone) return `phone:${phone}`;
  return `name:${(g?.name || '').trim().toLowerCase()}`;
}

/** How many meaningful fields a guardian record has filled in - used to
 * decide which of two duplicate entries is the "richer"/more complete one
 * worth keeping. */
function completenessScore(g: GuardianLike): number {
  const fields = [
    g?.name, g?.relation, g?.phone, g?.email, g?.occupation, g?.employer,
  ];
  let score = fields.filter((v) => typeof v === 'string' && v.trim().length > 0).length;
  if (g?.isPrimary) score += 1; // being marked primary is meaningful, don't discard it
  if (g?.isEmergencyContact) score += 0.5;
  return score;
}

/** Picks the entry to keep between two duplicates of the same guardian.
 * Prefers the more complete record (more non-empty fields filled in); ties
 * broken by preferring whichever is currently marked isPrimary, then by
 * keeping `a` (the earlier-seen entry) for stability. */
export function pickMoreCompleteGuardian<T extends GuardianLike>(a: T, b: T): T {
  const scoreA = completenessScore(a);
  const scoreB = completenessScore(b);
  if (scoreB > scoreA) return b;
  if (scoreA > scoreB) return a;
  if (b.isPrimary && !a.isPrimary) return b;
  return a;
}

/** Dedupes a student's guardians[] array, keeping exactly one - the most
 * complete - entry per distinct guardian (by guardianDedupeKey), and
 * preserving the array's original relative order (by first-seen position
 * of each key) so unrelated ordering doesn't shuffle around on every run.
 * Idempotent: running it again on an already-deduped array is a no-op. */
export function dedupeGuardians<T extends GuardianLike>(guardians: T[]): T[] {
  const order: string[] = [];
  const byKey = new Map<string, T>();

  for (const g of guardians || []) {
    const key = guardianDedupeKey(g);
    if (!byKey.has(key)) {
      order.push(key);
      byKey.set(key, g);
    } else {
      byKey.set(key, pickMoreCompleteGuardian(byKey.get(key)!, g));
    }
  }

  return order.map((key) => byKey.get(key)!);
}
