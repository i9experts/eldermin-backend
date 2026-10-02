// Shared date-display helper, parameterized by School.dateFormat ('DD/MM/YYYY'
// the Pakistani/day-first default, or 'MM/DD/YYYY'). Used anywhere a date is
// rendered onto a printed document (challan, invoice HTML, reports) so the
// same school setting that drives the frontend's display also drives what
// gets printed, instead of each call site hardcoding its own locale/format.

export type DateFormatPreference = 'DD/MM/YYYY' | 'MM/DD/YYYY';

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_LONG = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

/** Numeric date string, e.g. "02-10-2026" (DD-MM-YYYY) or "10-02-2026" (MM-DD-YYYY). */
export function formatDateNumeric(date: Date | string | null | undefined, preference?: string): string {
  if (!date) return 'N/A';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'N/A';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return preference === 'MM/DD/YYYY' ? `${month}-${day}-${year}` : `${day}-${month}-${year}`;
}

/** Month-abbreviated date string, e.g. "02-Oct-2026" or "Oct-02-2026". */
export function formatDateShort(date: Date | string | null | undefined, preference?: string): string {
  if (!date) return 'N/A';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'N/A';
  const day = String(d.getDate()).padStart(2, '0');
  const month = MONTH_SHORT[d.getMonth()];
  const year = d.getFullYear();
  return preference === 'MM/DD/YYYY' ? `${month}-${day}-${year}` : `${day}-${month}-${year}`;
}

/** Month + year label, e.g. "October 2026" - identical either way, kept here so callers don't special-case it. */
export function formatMonthYear(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return `${MONTH_LONG[d.getMonth()]} ${d.getFullYear()}`;
}
