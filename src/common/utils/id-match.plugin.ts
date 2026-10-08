import { Schema } from 'mongoose';
import { widenIdFilter } from './id-match.util';

/**
 * Global Mongoose plugin (B0 fix, see docs/staff-portal/B0_ID_TYPING.md).
 *
 * For every schema path that compiled to Mixed (the 541 `@Prop({ type: Types.ObjectId })` declarations), widens
 * id-like equality / $in filter values to match BOTH the string and the ObjectId representation. Only the QUERY
 * filter is touched (find, findOne, count, update ops, delete ops, findOneAnd ops, and the leading aggregate $match); stored data and
 * update documents are never changed. Paths that are really ObjectId/String typed are skipped (Mongoose casts them).
 *
 * Upserts are skipped on purpose: Mongo seeds the inserted document from the equality conditions of the filter,
 * a `$in` would drop them.
 */
const QUERY_OPS = [
  'find', 'findOne', 'countDocuments', 'distinct',
  'updateOne', 'updateMany', 'replaceOne',
  'deleteOne', 'deleteMany',
  'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace',
];

export function mixedPathChecker(schema: Schema): (key: string) => boolean {
  return (key: string) => {
    try {
      const p: any = schema.path(key);
      if (!p) return false;
      if (p.instance === 'Mixed') return true;
      // arrays of ids (`[Types.ObjectId]`) compile to an array of Mixed: equality / $in on them is element-wise, same widening applies
      return p.instance === 'Array' && (p.embeddedSchemaType ?? p.caster)?.instance === 'Mixed';
    } catch {
      return false;
    }
  };
}

export function idMatchPlugin(schema: Schema): void {
  const isMixed = mixedPathChecker(schema);

  for (const op of QUERY_OPS) {
    schema.pre(op as any, function (this: any) {
      try {
        if (this.getOptions?.().upsert) return;
        const filter = this.getFilter?.();
        if (!filter) return;
        this.setQuery(widenIdFilter(filter, isMixed));
      } catch {
        /* never break a query because of the widening */
      }
    });
  }

  schema.pre('aggregate', function (this: any) {
    try {
      const pipeline: any[] = this.pipeline?.();
      if (!Array.isArray(pipeline)) return;
      for (let i = 0; i < pipeline.length; i++) {
        const stage = pipeline[i];
        if (stage && stage.$match) pipeline[i] = { ...stage, $match: widenIdFilter(stage.$match, isMixed) };
        else break; // only the leading $match stages reference real schema paths
      }
    } catch {
      /* ignore */
    }
  });
}
