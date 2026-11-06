// What a guardian receives from GET /parent-portal/students/:id/qaida - the same facts the printed Qaida & Tajweed report carries
// (progress, per-takhti status/dates/attempts/latest remarks, the recurring error tags), as an explicit allowlist so a new field on
// QaidaService.getReportData is private by default. Never sent: who assessed each attempt (assessedBy / assessedById), the staff-only
// priorRecordNote (why a late joiner has no history), recordType, the per-attempt sabaq log's assessor, takhti reference text/focus.

const pick = (o: any, keys: readonly string[]): Record<string, any> => {
  const out: Record<string, any> = {};
  if (!o) return out;
  for (const k of keys) if (o[k] !== undefined) out[k] = o[k];
  return out;
};

export const PARENT_QAIDA_REPORT_FIELDS = [
  'studentName', 'grade', 'section', 'currentTakhti', 'overallStatus', 'masteredCount', 'totalTakhtis', 'trackedTakhtis', 'masteryPct',
  'startDate', 'completionDate', 'currentTeacher', 'overallRemarks',
] as const;

export const PARENT_QAIDA_TAKHTI_FIELDS = [
  'number', 'titleEn', 'titleUr', 'pageReference', 'status', 'startedDate', 'masteredDate', 'revisionCount', 'attemptCount',
] as const;

export const PARENT_QAIDA_SABAQ_FIELDS = ['date', 'sabaqFrom', 'sabaqTo', 'rating'] as const;

export const PARENT_QAIDA_ATTEMPT_FIELDS = [
  'date', 'rating', 'makhrajAccuracy', 'tajweedAccuracy', 'fluency', 'errorsNoted', 'remarks', 'sabaqFrom', 'sabaqTo',
] as const;

export function projectParentQaidaReport(report: any): Record<string, any> {
  const out = pick(report, PARENT_QAIDA_REPORT_FIELDS);
  out.takhtis = (report?.takhtis || []).map((t: any) => ({
    ...pick(t, PARENT_QAIDA_TAKHTI_FIELDS),
    sabaqLog: (t.sabaqLog || []).map((s: any) => pick(s, PARENT_QAIDA_SABAQ_FIELDS)),
    latestAttempt: t.latestAttempt ? pick(t.latestAttempt, PARENT_QAIDA_ATTEMPT_FIELDS) : null,
  }));
  out.commonErrors = (report?.commonErrors || []).map((e: any) => pick(e, ['error', 'count']));
  return out;
}
