import { PdfLogSchema } from './pdf-log.schema';

// PdfService.logPdf() writes one of these `type` values after every PDF
// generation, purely for an admin-facing audit trail - a value missing
// from this enum doesn't break the PDF download itself, but Mongoose
// rejects the write, so that download silently never appears in the
// audit log (the school sees "Failed to write PDF audit log (non-fatal)"
// in server logs only). `exam-report-card`, `tarbiyah-class-report`,
// `tarbiyah-school-report` and `meeting_minutes` were all missing even
// though PdfService actively logs those exact types - pin the full set
// of types the service logs so a newly-added template can't silently
// drop out of the audit trail again.
describe('PdfLog schema', () => {
  it("accepts every PDF type PdfService.logPdf actually logs", () => {
    const enumValues: string[] = (PdfLogSchema.path('type') as any).enumValues;
    const typesLoggedByPdfService = [
      'report-card', 'exam-report-card', 'qaida-report', 'nazra-report', 'tarbiyah-report',
      'tarbiyah-class-report', 'tarbiyah-school-report', 'invoice',
      'fee-revenue-report', 'timetable', 'class_diary', 'meeting_minutes',
      'fee_receipt',
    ];
    for (const type of typesLoggedByPdfService) {
      expect(enumValues).toContain(type);
    }
  });
});
