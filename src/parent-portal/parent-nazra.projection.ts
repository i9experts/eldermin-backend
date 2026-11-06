// What a guardian receives from GET /parent-portal/students/:id/nazra - the same facts the web's Nazra tracker report carries
// (progress, per-para status/dates/attempts, the recurring error tags), as an explicit allowlist so a new field on
// NazraService.getReportData is private by default. Never sent: who assessed each attempt (assessedBy), the staff-only
// priorRecordNote (why a late joiner has no history), recordType, the full Sabaq/Sabqi/Manzil diary log.
// Mirrors parent-qaida.projection.ts.

const pick = (o: any, keys: readonly string[]): Record<string, any> => {
  const out: Record<string, any> = {};
  if (!o) return out;
  for (const k of keys) if (o[k] !== undefined) out[k] = o[k];
  return out;
};

export const PARENT_NAZRA_REPORT_FIELDS = [
  'studentName', 'grade', 'section', 'currentPara', 'overallStatus', 'completedCount', 'totalParas', 'trackedParas', 'completionPct',
  'startDate', 'completionDate', 'currentTeacher', 'overallRemarks',
] as const;

export const PARENT_NAZRA_PARA_FIELDS = [
  'number', 'titleEn', 'titleAr', 'approxPageRange', 'status', 'startedDate', 'completedDate', 'revisionCount', 'attemptCount',
] as const;

export const PARENT_NAZRA_ATTEMPT_FIELDS = [
  'date', 'rating', 'pageFrom', 'pageTo', 'makhrajAccuracy', 'tajweedAccuracy', 'fluency', 'errorsNoted', 'remarks',
] as const;

export function projectParentNazraReport(report: any): Record<string, any> {
  const out = pick(report, PARENT_NAZRA_REPORT_FIELDS);
  out.paras = (report?.paras || []).map((p: any) => ({
    ...pick(p, PARENT_NAZRA_PARA_FIELDS),
    latestAttempt: p.latestAttempt ? pick(p.latestAttempt, PARENT_NAZRA_ATTEMPT_FIELDS) : null,
  }));
  out.commonErrors = (report?.commonErrors || []).map((e: any) => pick(e, ['error', 'count']));
  return out;
}
