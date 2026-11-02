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
