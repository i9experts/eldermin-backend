// Student full name, including the middle name - several call sites
// (fee invoices/vouchers, receipts, report cards) built this as just
// `${firstName} ${lastName}`, silently dropping middleName even though
// it displays correctly everywhere else (Student Profile, search
// results). One shared helper so a student's name is consistent across
// every printed document.
export function studentFullName(student: { firstName?: string; middleName?: string; lastName?: string } | null | undefined): string {
  if (!student) return '';
  return [student.firstName, student.middleName, student.lastName].filter(Boolean).join(' ').trim();
}
