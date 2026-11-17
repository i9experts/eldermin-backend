// Explicit field allowlists for what a guardian may receive about behaviour /
// Tarbiyah (B0 security fix). Anything not listed is never sent, so a new
// BehaviourRecord / TarbiyahAssessment field is private by default.
//
// Fields the parent app reads (eldermin-parent-mobile-app, lib/app/modules/tarbiyah):
//   behaviour record: points, type, title, category, description  (views/tarbiyah_screen.dart:172-184)
//   assessment:       assessmentDate (controllers/tarbiyah_controller.dart:26-28), traits[].traitName/percentage/traitKey
//                     (screen:17-20,64), areasOfStrength (:66), overallPercentage (:67), overallScore (:83),
//                     teacherObservations (:86)
// Also kept (cheap, non-sensitive, needed by the planned detail sheets / sorting): _id, studentId, date,
// period/periodType, overallRating, areasForImprovement, recommendedActions, parentSharedDate, trait observation.
//
// Never sent (sensitive / internal): witnesses, location, followUp*, resolvedNote, resolvedDate, parentResponse,
// verified/verifiedBy, reportedBy/reportedById, assessedBy/assessedById, attachments, consequence, severity,
// actionTaken, parentNotified*, campusId, schoolSlug, academicYear, rollNumber; counselling / intervention /
// contract data is never read on this path.

export const PARENT_BEHAVIOUR_RECORD_FIELDS = [
  '_id', 'studentId', 'date', 'type', 'category', 'title', 'description', 'points',
] as const;

export const PARENT_TARBIYAH_FIELDS = [
  '_id', 'studentId', 'period', 'periodType', 'assessmentDate', 'traits',
  'overallScore', 'overallPercentage', 'overallRating', 'teacherObservations',
  'areasOfStrength', 'areasForImprovement', 'recommendedActions', 'parentSharedDate',
] as const;

export const PARENT_TARBIYAH_TRAIT_FIELDS = ['traitKey', 'score', 'observation'] as const;

/** Mongo select string for the allowlist (no `-` exclusions, so unknown fields stay out). */
export const selectOf = (fields: readonly string[]): string => fields.join(' ');

export function pickFields(doc: any, fields: readonly string[]): Record<string, any> {
  const out: Record<string, any> = {};
  if (!doc) return out;
  for (const f of fields) if (doc[f] !== undefined) out[f] = doc[f];
  return out;
}

export function projectParentBehaviourRecord(r: any): Record<string, any> {
  return pickFields(r, PARENT_BEHAVIOUR_RECORD_FIELDS);
}

export function projectParentTarbiyahAssessment(a: any): Record<string, any> {
  const out = pickFields(a, PARENT_TARBIYAH_FIELDS);
  if (Array.isArray(a?.traits)) out.traits = a.traits.map((t: any) => pickFields(t, PARENT_TARBIYAH_TRAIT_FIELDS));
  return out;
}
