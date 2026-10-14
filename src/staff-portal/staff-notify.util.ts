import { Types } from 'mongoose';

/** Resolve a tenant's slug from its id using the raw `tenants` collection. Returns null on any failure. */
export async function resolveSchoolSlug(db: any, tenantId: any): Promise<string | null> {
  try {
    const id = Types.ObjectId.isValid(String(tenantId)) ? new Types.ObjectId(String(tenantId)) : null;
    if (!id) return null;
    const t = await db.collection('tenants').findOne({ _id: id }, { projection: { slug: 1 } });
    return t?.slug || null;
  } catch {
    return null;
  }
}
