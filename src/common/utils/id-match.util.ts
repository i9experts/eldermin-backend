import { Types } from 'mongoose';

/**
 * B0 (see docs/staff-portal/B0_ID_TYPING.md).
 *
 * With the installed @nestjs/mongoose 11.0.4 + mongoose 9.6.3 every `@Prop({ type: Types.ObjectId })` compiles to a
 * MIXED schema path, so Mongoose never casts query values on it. Ids that come from the JWT are strings while a lot
 * of stored data holds ObjectIds (and vice versa), so an equality filter only matches one representation.
 *
 * `idMatch` builds a filter value that matches BOTH representations. It is a strict superset of the plain value:
 * every document that matched `{ field: v }` still matches `{ field: idMatch(v) }`.
 */
const HEX24 = /^[0-9a-fA-F]{24}$/;

export function isIdLike(v: unknown): boolean {
  if (v instanceof Types.ObjectId) return true;
  if (typeof v === 'string') return HEX24.test(v);
  // a foreign bson ObjectId (different bson copy)
  if (v && typeof v === 'object' && (v as any)._bsontype === 'ObjectId' && typeof (v as any).toHexString === 'function') {
    return HEX24.test((v as any).toHexString());
  }
  return false;
}

/** Both forms of one id: [string, ObjectId]. Returns null when v is not a valid 24-hex string / ObjectId. */
export function idForms(v: unknown): [string, Types.ObjectId] | null {
  if (!isIdLike(v)) return null;
  const hex = typeof v === 'string' ? v : (v as any).toHexString();
  return [hex, new Types.ObjectId(hex)];
}

/** Valid id (24-hex string or ObjectId) -> `{ $in: [string, ObjectId] }`; anything else is returned unchanged. */
export function idMatch<T = unknown>(v: T): T | { $in: Array<string | Types.ObjectId> } {
  const forms = idForms(v);
  return forms ? { $in: [forms[0], forms[1]] } : v;
}

/**
 * Array form: ids -> `{ $in: [every string form, every ObjectId form] }`. Entries that are not valid ids are kept as
 * they are (so a superset of `{ $in: values }`). Duplicates are removed. null/undefined/non-array -> unchanged.
 */
export function idMatchIn<T = unknown>(values: T[] | null | undefined): { $in: unknown[] } | null | undefined {
  if (!Array.isArray(values)) return values as any;
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const v of values) {
    const forms = idForms(v);
    if (forms) {
      for (const f of forms) {
        const key = `${typeof f === 'string' ? 's' : 'o'}:${String(f)}`;
        if (!seen.has(key)) { seen.add(key); out.push(f); }
      }
    } else {
      out.push(v);
    }
  }
  return { $in: out };
}

/** Nullable id filter: null/undefined stay as they are (so "field is null/missing" semantics are unchanged). */
export function idMatchNullable<T = unknown>(v: T | null | undefined): any {
  return v === null || v === undefined ? v : idMatch(v);
}

/**
 * Rewrites a Mongo filter object (not mutating it): every top-level / $and / $or / $nor condition on a key for which
 * `isMixedPath(key)` is true gets its id-like equality / $eq / $in value widened to both id forms. $ne / $nin / $not /
 * operators on ranges are left untouched (widening them would not be a superset).
 */
export function widenIdFilter(filter: any, isMixedPath: (key: string) => boolean): any {
  if (!filter || typeof filter !== 'object' || Array.isArray(filter)) return filter;
  const out: any = {};
  for (const key of Object.keys(filter)) {
    const val = filter[key];
    if (key === '$and' || key === '$or' || key === '$nor') {
      out[key] = Array.isArray(val) ? val.map((f: any) => widenIdFilter(f, isMixedPath)) : val;
      continue;
    }
    if (key.startsWith('$') || !isMixedPath(key)) { out[key] = val; continue; }
    if (isIdLike(val)) { out[key] = idMatch(val); continue; }
    if (Array.isArray(val) || val === null || typeof val !== 'object' || val instanceof Date || val instanceof RegExp) {
      out[key] = val;
      continue;
    }
    // operator object, e.g. { $in: [...] } / { $eq: x } (an ObjectId instance was handled above)
    const ops = Object.keys(val);
    if (ops.length > 0 && ops.every(o => o.startsWith('$'))) {
      const next: any = { ...val };
      if (isIdLike(val.$eq)) {
        // $eq + other operators: keep $eq semantics by turning it into $in only when it is the sole operator
        if (ops.length === 1) { delete next.$eq; next.$in = (idMatch(val.$eq) as any).$in; }
      }
      if (Array.isArray(val.$in) && !(ops.includes('$eq'))) {
        next.$in = (idMatchIn(val.$in) as any).$in;
      }
      out[key] = next;
    } else {
      out[key] = val;
    }
  }
  return out;
}
