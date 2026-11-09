// Tarbiyah Reports tab: grade/section filters now come from the real Grade/
// Section master (GradeLevelDropdown/SectionDropdown, e.g. "Grade 2"/"A"),
// but TarbiyahAssessment.grade/section are copied verbatim from
// Student.currentGrade/currentSection at creation time, which is free-text
// and can be stored as "GRADE-2"/"Grade 2A". An exact-match filter would
// silently return zero rows for a school with that drift - this verifies
// the tolerant matcher instead.
import { BehaviourService } from './behaviour.service';

function aggModel(result: any[] = []) {
  return { aggregate: jest.fn(async () => result) };
}
function build() {
  const tarbiyahModel: any = aggModel([]);
  const settingsModel: any = { findOne: jest.fn(() => ({ lean: () => Promise.resolve(null) })) };
  const n: any = {};
  return { svc: new BehaviourService(n, tarbiyahModel, n, n, n, settingsModel, n, n, n), tarbiyahModel };
}

describe('BehaviourService.getTarbiyahReportData grade/section filter tolerance', () => {
  it('grade filter matches every stored spelling via gradeMatcher', async () => {
    const { svc, tarbiyahModel } = build();
    await svc.getTarbiyahReportData('demo', { grade: 'Grade 2' });
    const filter = (tarbiyahModel.aggregate.mock.calls[0][0] as any[])[0].$match;
    expect(filter.grade.test('GRADE-2')).toBe(true);
    expect(filter.grade.test('grade-2')).toBe(true);
    expect(filter.grade.test('Grade 2')).toBe(true);
    expect(filter.grade.test('Grade 3')).toBe(false);
  });

  it('section filter matches a bare letter even when the stored section bakes the grade in ("Grade 2A")', async () => {
    const { svc, tarbiyahModel } = build();
    await svc.getTarbiyahReportData('demo', { section: 'A' });
    const filter = (tarbiyahModel.aggregate.mock.calls[0][0] as any[])[0].$match;
    expect(filter.section.test('Grade 2A')).toBe(true);
    expect(filter.section.test('A')).toBe(true);
    expect(filter.section.test('Section A')).toBe(true);
    expect(filter.section.test('Grade 2B')).toBe(false);
  });
});

// Grade-1 "All sections" totals (45 students/47 assessments) didn't add up
// against Grade 1A (28/28) + Grade 1B (9/11): some assessments' stored
// `section` is a free-text snapshot that no longer matches any of the
// grade's current real sections, so they vanish from every section-specific
// filter while still counting in the grade-only total. sectionBreakdown
// surfaces the raw per-section counts (including any orphaned value) so
// that gap is visible instead of silent.
describe('BehaviourService.getTarbiyahReportData sectionBreakdown', () => {
  it('is populated with raw per-section counts when a grade is picked but no section is', async () => {
    const rows = [{ section: 'Grade 1A', avgOverallScore: 3.8, studentCount: 28, assessmentCount: 28 }];
    const { svc, tarbiyahModel } = build();
    // Only the sectionBreakdown pipeline groups by '$section' - every other
    // pipeline in this method groups by something else, so match on that to
    // tell them apart without depending on call order.
    tarbiyahModel.aggregate = jest.fn(async (pipeline: any[]) => {
      const isSectionBreakdown = pipeline.some((stage) => stage.$group && stage.$group._id === '$section');
      return isSectionBreakdown ? rows : [];
    });
    const result = await svc.getTarbiyahReportData('demo', { grade: 'Grade 1' });
    expect(result.sectionBreakdown).toBe(rows);
  });

  it('is null when a section filter is already applied', async () => {
    const { svc, tarbiyahModel } = build();
    tarbiyahModel.aggregate = jest.fn(async () => []);
    const result = await svc.getTarbiyahReportData('demo', { grade: 'Grade 1', section: 'A' });
    expect(result.sectionBreakdown).toBeNull();
  });

  it('is null when no grade is picked at all', async () => {
    const { svc, tarbiyahModel } = build();
    tarbiyahModel.aggregate = jest.fn(async () => []);
    const result = await svc.getTarbiyahReportData('demo', {});
    expect(result.sectionBreakdown).toBeNull();
  });
});
