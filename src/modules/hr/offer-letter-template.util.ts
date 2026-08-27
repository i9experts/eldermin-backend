// Pure, framework-free {{placeholder}} substitution for offer letter
// wording templates (HR-02). Deliberately mirrors the {{var}} convention
// already used by pdf.service.ts's own interpolate() and by
// ContractTemplate bodies, so an admin only has to learn one placeholder
// syntax across contracts, offer letters, and report templates.
export interface OfferLetterVariableSource {
  candidateName?: string | null;
  candidateEmail?: string | null;
  candidatePhone?: string | null;
  designation?: string | null;
  department?: string | null;
  currency?: string | null;
  proposedSalary?: number | null;
  proposedJoiningDate?: string | Date | null;
  offerValidUntil?: string | Date | null;
  probationPeriodMonths?: number | null;
  reportingTo?: string | null;
  offerNo?: string | null;
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

/** Builds the {{key: value}} map an offer letter template body is
 * substituted against. Exported separately from renderOfferLetterTemplate
 * so callers (e.g. a future preview endpoint) can inspect available
 * variables without re-deriving formatting rules. */
export function buildOfferLetterVariables(offer: OfferLetterVariableSource, schoolName: string): Record<string, string> {
  return {
    candidateName: offer.candidateName || '',
    candidateEmail: offer.candidateEmail || '',
    candidatePhone: offer.candidatePhone || '',
    designation: offer.designation || '',
    department: offer.department || '—',
    schoolName: schoolName || '',
    proposedSalary: `${offer.currency || 'PKR'} ${(offer.proposedSalary || 0).toLocaleString()}/month`,
    joiningDate: formatDate(offer.proposedJoiningDate),
    offerValidUntil: formatDate(offer.offerValidUntil),
    probationPeriod: offer.probationPeriodMonths ? `${offer.probationPeriodMonths} months` : '',
    reportingTo: offer.reportingTo || '',
    offerNo: offer.offerNo || '',
  };
}

/** Substitutes every {{variable}} in an offer letter template body with the
 * matching value for this specific offer. An unknown placeholder resolves
 * to an empty string rather than being left as literal `{{...}}` text in
 * the generated PDF. */
export function renderOfferLetterTemplate(body: string, offer: OfferLetterVariableSource, schoolName: string): string {
  const vars = buildOfferLetterVariables(offer, schoolName);
  return (body || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key) => (vars[key] != null ? String(vars[key]) : ''));
}
