// Student 360 behaviour block (B1): union of the legacy `student_behaviour` collection and `behaviour_records`.
import { projectParentBehaviourRecord } from '../parent-portal/parent-behaviour.projection';

type Source = 'legacy' | 'records';

export interface Behaviour360Input {
  legacySummary: any[];   // [{ _id: type, count, totalPoints }]
  recordsSummary: any[];
  legacyRecent: any[];
  recordsRecent: any[];
  /** parent / student tokens: items are cut to the parent allowlist (no witnesses, notes, reporter ids...). */
  guardianView?: boolean;
  limit?: number;
}

const ts = (d: any): number => { const t = d ? new Date(d).getTime() : 0; return Number.isFinite(t) ? t : 0; };

/** +|points| for a merit, -|points| for a demerit, raw for a note: right whether a store keeps demerits signed or not. */
const signed = (type: string, points: number): number => {
  const p = Number(points) || 0;
  return type === 'positive' ? Math.abs(p) : type === 'negative' ? -Math.abs(p) : p;
};

export function mergeBehaviour360(i: Behaviour360Input): {
  summary: Record<string, { count: number; points: number }>; totalPoints: number; recent: any[];
} {
  const summary: Record<string, { count: number; points: number }> = {};
  let totalPoints = 0;
  for (const s of [...(i.legacySummary || []), ...(i.recordsSummary || [])]) {
    const k = String(s._id);
    const e = (summary[k] ||= { count: 0, points: 0 });
    e.count += s.count || 0;
    e.points += Number(s.totalPoints) || 0; // raw stored sum, as before
    totalPoints += signed(k, s.totalPoints);
  }
  const tag = (rows: any[], source: Source) => (rows || []).map((r) => ({ ...r, source }));
  // a document that appears in both lists (same collection reached through two models) is shown once, as 'records'
  const recordIds = new Set((i.recordsRecent || []).map((r) => String(r._id)));
  const items = [...tag((i.legacyRecent || []).filter((r) => !recordIds.has(String(r._id))), 'legacy'), ...tag(i.recordsRecent, 'records')]
    .sort((a, b) => ts(b.date) - ts(a.date) || String(b._id).localeCompare(String(a._id)))
    .slice(0, i.limit ?? 10);
  const recent = i.guardianView ? items.map((r) => ({ ...projectParentBehaviourRecord(r), source: r.source })) : items;
  return { summary, totalPoints, recent };
}
