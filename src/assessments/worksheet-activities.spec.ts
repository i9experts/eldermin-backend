import { makeAssessmentService } from './assessment-test-fakes';

describe('worksheet activities: PDF rendering helpers', () => {
  const { service } = makeAssessmentService();
  const svc: any = service;
  const ltr = { dir: 'ltr' };
  const rtl = { dir: 'rtl' };

  describe('tracing', () => {
    it('renders a repeated letter trace row with the hollow-stroke glyph class', () => {
      const html = svc.renderWorksheetActivity(
        { type: 'tracing', questionText: 'Trace the letter A', traceType: 'letter', traceContent: 'A' },
        ltr,
      );
      expect(html).toContain('trace-glyph');
      expect(html).toContain('>A<');
      expect((html.match(/trace-glyph/g) || []).length).toBeGreaterThanOrEqual(6);
    });

    it('renders a number trace row', () => {
      const html = svc.renderWorksheetActivity(
        { type: 'tracing', questionText: 'Trace the number 7', traceType: 'number', traceContent: '7' },
        ltr,
      );
      expect(html).toContain('>7<');
    });

    it('renders a word trace row with fewer repetitions than a single letter/number', () => {
      const html = svc.renderWorksheetActivity(
        { type: 'tracing', questionText: 'Trace the word', traceType: 'word', traceContent: 'Cat' },
        ltr,
      );
      expect(html).toContain('trace-word');
      expect((html.match(/trace-glyph/g) || []).length).toBe(3);
    });

    it('renders dashed-outline shape SVGs for a comma-separated shape list', () => {
      const html = svc.renderWorksheetActivity(
        { type: 'tracing', questionText: 'Trace the shapes', traceType: 'shape', traceContent: 'circle, square, triangle, star' },
        ltr,
      );
      expect(html).toContain('<circle');
      expect(html).toContain('<rect');
      expect(html).toContain('polygon'); // triangle + star
      expect((html.match(/trace-shape"/g) || []).length).toBe(4);
    });

    it('falls back to a circle for an unrecognized shape name rather than crashing', () => {
      const html = svc.renderWorksheetActivity(
        { type: 'tracing', questionText: 'Trace', traceType: 'shape', traceContent: 'hexagon' },
        ltr,
      );
      expect(html).toContain('<circle');
    });
  });

  describe('counting', () => {
    it('repeats the emoji correctCount times and renders every circle option', () => {
      const html = svc.renderWorksheetActivity(
        { type: 'counting', questionText: 'Count the apples', countEmoji: '🍎', correctCount: 4, countOptions: [3, 4, 5] },
        ltr,
      );
      expect((html.match(/🍎/g) || []).length).toBe(4);
      expect(html).toContain('>3<');
      expect(html).toContain('>4<');
      expect(html).toContain('>5<');
    });

    it('renders Arabic-Indic numerals for the circle options on an RTL worksheet', () => {
      const html = svc.renderWorksheetActivity(
        { type: 'counting', questionText: 'گنیں', countEmoji: '⭐', correctCount: 2, countOptions: [1, 2, 3] },
        rtl,
      );
      expect(html).toContain('>١<');
      expect(html).toContain('>٢<');
      expect(html).toContain('>٣<');
    });

    it('does not crash when countOptions is empty, falling back to just the correct count', () => {
      const html = svc.renderWorksheetActivity(
        { type: 'counting', questionText: 'Count', countEmoji: '⭐', correctCount: 5, countOptions: [] },
        ltr,
      );
      expect(html).toContain('count-option');
    });
  });

  describe('matching reused on a worksheet', () => {
    it('renders the same matching-columns layout used on exam papers', () => {
      const html = svc.renderWorksheetActivity(
        {
          type: 'matching', questionText: 'Match the animal to its sound', _id: 'q1',
          matchingPairs: [{ left: 'Cat', right: 'Meow' }, { left: 'Dog', right: 'Woof' }],
        },
        ltr,
      );
      expect(html).toContain('matching-columns');
      expect(html).toContain('Cat');
      expect(html).toContain('Meow');
    });
  });
});
