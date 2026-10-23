import { makeAssessmentService, oid } from './assessment-test-fakes';

describe('matching-column question: PDF rendering helpers', () => {
  const { service } = makeAssessmentService();
  const svc: any = service;

  it('shuffle is deterministic for the same seed (question id)', () => {
    const items = ['Sidq', 'Amanah', 'Sabr', 'Shukr', 'Tawadu'];
    const seed = oid().toString();
    const first = svc.seededShuffle(items, seed);
    const second = svc.seededShuffle(items, seed);
    expect(second).toEqual(first);
  });

  it('shuffle differs for a different seed (different question ids do not all shuffle identically)', () => {
    const items = ['Sidq', 'Amanah', 'Sabr', 'Shukr', 'Tawadu', 'Ikhlas', 'Haya'];
    const shuffles = Array.from({ length: 5 }, () => svc.seededShuffle(items, oid().toString()));
    const allIdentical = shuffles.every((s) => JSON.stringify(s) === JSON.stringify(shuffles[0]));
    expect(allIdentical).toBe(false);
  });

  it('shuffle is a permutation - same items, same length, nothing dropped or duplicated', () => {
    const items = ['A', 'B', 'C', 'D'];
    const shuffled = svc.seededShuffle(items, 'seed-1');
    expect(shuffled).toHaveLength(items.length);
    expect([...shuffled].sort()).toEqual([...items].sort());
  });

  it('renders a matching layout for a single pair without crashing', () => {
    const pairs = [{ left: 'Sidq', right: 'Truthfulness' }];
    const html = svc.renderMatchingColumns(pairs, 'q1', { dir: 'ltr' });
    expect(html).toContain('Sidq');
    expect(html).toContain('Truthfulness');
    expect(html).toContain('matching-columns');
  });

  it('renders a matching layout for a large pair set (8-10 pairs) without crashing', () => {
    const pairs = Array.from({ length: 10 }, (_, i) => ({ left: `Left${i}`, right: `Right${i}` }));
    const html = svc.renderMatchingColumns(pairs, 'q-large', { dir: 'ltr' });
    pairs.forEach((p) => {
      expect(html).toContain(p.left);
      expect(html).toContain(p.right);
    });
  });

  it('LTR layout letters the right column A, B, C...', () => {
    const pairs = [{ left: 'L1', right: 'R1' }, { left: 'L2', right: 'R2' }];
    const html = svc.renderMatchingColumns(pairs, 'q-ltr', { dir: 'ltr' });
    expect(html).toContain('>A.<');
    expect(html).toContain('>B.<');
  });

  it('RTL layout numbers the right column with Arabic-Indic numerals, matching the MCQ convention', () => {
    const pairs = [{ left: 'بایاں', right: 'دایاں' }, { left: 'بایاں2', right: 'دایاں2' }];
    const html = svc.renderMatchingColumns(pairs, 'q-rtl', { dir: 'rtl' });
    expect(html).toContain('>١.<');
    expect(html).toContain('>٢.<');
  });

  it('arabicIndicNumeral generalizes past the old 6-item cap (e.g. a 10-pair matching question)', () => {
    expect(svc.arabicIndicNumeral(0)).toBe('١');
    expect(svc.arabicIndicNumeral(5)).toBe('٦');
    expect(svc.arabicIndicNumeral(9)).toBe('١٠');
  });

  it('matching-columns container uses an unconditional flex-direction: row (RTL column order comes from the inherited <html dir>, not a second CSS flip)', () => {
    const pairs = [{ left: 'بایاں', right: 'دایاں' }];
    const html = svc.renderMatchingColumns(pairs, 'q-dir', { dir: 'rtl' });
    // Column A must still be the first DOM child for both LTR and RTL -
    // visual side is left entirely to the inherited `direction`, never to
    // row-reverse, or RTL papers double-flip and Column A lands on the
    // wrong side (the bug reported against a live Urdu paper).
    const colAIndex = html.indexOf('matching-col-title');
    const colBIndex = html.indexOf('matching-col-title', colAIndex + 1);
    expect(colAIndex).toBeGreaterThanOrEqual(0);
    expect(colBIndex).toBeGreaterThan(colAIndex);
    expect(html.indexOf('كالم الف')).toBeLessThan(html.indexOf('كالم ب'));
  });
});
