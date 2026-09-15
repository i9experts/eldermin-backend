// Pure, framework-free helper for phone-number identity. Root cause of
// parent-app login failing with "No student record found with this
// WhatsApp number" even when the guardian's number was correctly entered
// in the dashboard: guardian phones were saved to Student.guardians[].phone
// exactly as typed (e.g. "03172573105"), while the parent-portal login
// normalizes the number the parent types into WhatsApp/E.164 form (e.g.
// "+923172573105") before querying `guardians.phone`. Mongo does an exact
// string match, so two representations of the same real number never
// matched and every parent hit this 404.
//
// The fix has two halves, both using this one shared implementation so the
// three guardian write paths (addGuardianToStudent, the generic student
// update, and the bulk import) and the parent-portal read path never drift
// into different ideas of "same number":
//  1. Write side: normalizePhone() is applied wherever a guardian phone is
//     saved, so every NEW record is stored in one canonical form.
//  2. Read side: phoneMatchCandidates() lists every representation a
//     pre-existing, un-normalized record might have been saved in, so
//     lookups still succeed against historical data without requiring a
//     one-off migration of every student record.

const DEFAULT_COUNTRY_CODE = '92'; // Pakistan - matches this product's userbase

/** Normalizes a phone number to a single canonical E.164-style form
 * (e.g. "+923172573105"), regardless of which of the common local
 * conventions it was entered in:
 *   03172573105    (local, leading 0)
 *   3172573105     (local, no leading 0)
 *   923172573105   (country code, no +)
 *   +923172573105  (already canonical)
 * Returns an empty string for empty/whitespace-only input so callers can
 * treat "no phone provided" and "invalid phone" consistently. */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return '';
  const digits = raw.replace(/[^\d+]/g, '');
  if (!digits) return '';
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  if (digits.startsWith(DEFAULT_COUNTRY_CODE)) return `+${digits}`;
  if (digits.startsWith('0')) return `+${DEFAULT_COUNTRY_CODE}${digits.slice(1)}`;
  return `+${DEFAULT_COUNTRY_CODE}${digits}`;
}

/** Lists every representation a real-world guardian record might have this
 * number saved under, so a lookup can match it with `{ $in: candidates }`
 * even if it was saved before write-side normalization existed (or was
 * entered inconsistently via bulk import). Always includes the canonical
 * normalizePhone() form first. Returns [] for empty input. */
export function phoneMatchCandidates(raw: string | null | undefined): string[] {
  const canonical = normalizePhone(raw);
  if (!canonical) return [];

  const candidates = new Set<string>([canonical]);
  const withoutPlus = canonical.slice(1); // "923172573105"
  candidates.add(withoutPlus);

  if (withoutPlus.startsWith(DEFAULT_COUNTRY_CODE)) {
    const nationalSignificant = withoutPlus.slice(DEFAULT_COUNTRY_CODE.length); // "3172573105"
    candidates.add(nationalSignificant);
    candidates.add(`0${nationalSignificant}`); // "03172573105"
  }

  return Array.from(candidates);
}

/** Builds a MongoDB-safe regex that matches a stored guardians.phone value
 * even if it still has punctuation baked into the stored string itself
 * (e.g. "0315-2711020" or "0315 2711020") - a real, observed case: a
 * student created before every write path normalized on save (see
 * students.service.ts createStudent/addGuardianToStudent) can have a
 * guardian phone persisted with the exact separators the admin typed at
 * enrollment time. phoneMatchCandidates() alone can't catch this because
 * it only generates clean, punctuation-free candidates and Mongo does an
 * exact string match - so a lookup for "3172573105" would never equal a
 * stored "0315-2711020". This instead matches on the digits alone,
 * tolerating any run of non-digit characters between them, so historical
 * punctuated data works without a one-off migration of every record.
 * Anchored at both ends so it can't false-match a longer number that
 * merely contains these digits as a substring. Returns null for empty
 * input. */
export function phoneMatchRegex(raw: string | null | undefined): RegExp | null {
  const canonical = normalizePhone(raw);
  if (!canonical) return null;

  const nationalSignificant = canonical.startsWith(`+${DEFAULT_COUNTRY_CODE}`)
    ? canonical.slice(1 + DEFAULT_COUNTRY_CODE.length)
    : canonical.slice(1);
  if (!nationalSignificant) return null;

  const digitPattern = nationalSignificant.split('').join('[^0-9]*');
  // Optional prefix: +92, 0092, 92, or a plain local leading 0 - each
  // possibly followed by punctuation before the significant digits start.
  return new RegExp(`^(?:\\+?${DEFAULT_COUNTRY_CODE}|00${DEFAULT_COUNTRY_CODE}|0)?[^0-9]*${digitPattern}$`);
}
