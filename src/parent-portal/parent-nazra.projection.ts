// What a guardian receives from GET /parent-portal/students/:id/nazra - the Nazra (Qur'an reading) progress the teacher records on the
// web: the 30-para journey, per-para status/dates/attempts/latest remarks, the daily Sabaq / Sabqi / Manzil diary, and the recurring error
// tags. Explicit allowlist (a new field on NazraService.getReportData is private by default). Never sent: who assessed (assessedBy /
// assessedById), the staff-only priorRecordNote, recordType, studentId.

const pick = (o: any, keys: readonly string[]): Record<string, any> => {
  const out: Record<string, any> = {};
  if (!o) return out;
  for (const k of keys) if (o[k] !== undefined) out[k] = o[k];
  return out;
};

/** The diary is returned newest first and capped: a school year of daily entries is a long list for a phone. */
export const PARENT_NAZRA_DIARY_LIMIT = 60;

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

const SABAQ_FIELDS = ['paraNumber', 'pageFrom', 'pageTo', 'makhrajAccuracy', 'tajweedAccuracy', 'fluency', 'rating', 'errorsNoted', 'remarks'] as const;
const REVISION_FIELDS = ['paraNumber', 'pageFrom', 'pageTo', 'rating', 'errorsNoted', 'remarks'] as const;

export function projectParentNazraReport(report: any): Record<string, any> {
  const out = pick(report, PARENT_NAZRA_REPORT_FIELDS);
  out.paras = (report?.paras || []).map((p: any) => ({
    ...pick(p, PARENT_NAZRA_PARA_FIELDS),
    latestAttempt: p.latestAttempt ? pick(p.latestAttempt, PARENT_NAZRA_ATTEMPT_FIELDS) : null,
  }));
  const diary = [...(report?.diaryLog || [])].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  out.diaryTotal = diary.length;
  out.diary = diary.slice(0, PARENT_NAZRA_DIARY_LIMIT).map((e: any) => ({
    date: e.date,
    sabaq: e.sabaq ? pick(e.sabaq, SABAQ_FIELDS) : null,
    sabqi: e.sabqi ? pick(e.sabqi, REVISION_FIELDS) : null,
    manzil: e.manzil ? pick(e.manzil, REVISION_FIELDS) : null,
  }));
  out.commonErrors = (report?.commonErrors || []).map((e: any) => pick(e, ['error', 'count']));
  return out;
}
