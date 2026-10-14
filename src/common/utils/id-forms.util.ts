import { Types } from 'mongoose';

/**
 * Ids in this codebase are stored as strings in some documents and ObjectIds
 * in others (B0_ID_TYPING.md: the declared ObjectId paths are Mixed, so a
 * query only matches the exact stored type). Filter by both forms.
 */
export function idForms(id: any): any {
  const s = String(id ?? '');
  if (!Types.ObjectId.isValid(s)) return s;
  return { $in: [s, new Types.ObjectId(s)] };
}

export function sameId(a: any, b: any): boolean {
  return a != null && b != null && String(a) === String(b);
}
