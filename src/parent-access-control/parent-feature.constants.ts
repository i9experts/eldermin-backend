// ============================================================
// PARENT APP FEATURE ACCESS CONTROL — shared feature key registry
// Eldermin ERP | NestJS
//
// A school admin can suspend any of these "premium" parent-app features
// for a specific parent-student link (e.g. a fee defaulter or an
// administratively uncooperative parent), without suspending their whole
// account — attendance, fee/dues and basic messaging stay reachable.
//
// `school_diary` maps to the per-class daily diary (Teaching > Class
// Diary), not the school-wide circulars feed — circulars are treated as
// basic communication and are never suspendable here.
//
// `hygiene_checklist` has no parent-facing read endpoint yet (hygiene
// checks currently only feed the Parent Engagement Score on the admin
// side) — the key is reserved here for forward compatibility so the admin
// toggle UI and this registry don't need another migration once one is
// added, but no enforcement check exists for it yet.
// ============================================================

export const PARENT_FEATURE_KEYS = [
  'school_diary',
  'quiz',
  'tarbiyah_report',
  'academic_progress_report',
  'tarbiyah_at_home',
  'hygiene_checklist',
] as const;

export type ParentFeatureKey = (typeof PARENT_FEATURE_KEYS)[number];

export const PARENT_FEATURE_LABELS: Record<ParentFeatureKey, string> = {
  school_diary: 'School Diary',
  quiz: 'Quiz',
  tarbiyah_report: 'Tarbiyah Report',
  academic_progress_report: 'Academic Progress Report',
  tarbiyah_at_home: 'Tarbiyah at Home',
  hygiene_checklist: 'Hygiene Checklist',
};

export function isParentFeatureKey(value: string): value is ParentFeatureKey {
  return (PARENT_FEATURE_KEYS as readonly string[]).includes(value);
}
