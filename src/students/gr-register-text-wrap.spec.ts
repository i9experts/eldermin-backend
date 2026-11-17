import { wrapTextLines } from './students.service';

// Pins the fix for "GR Register address is overwriting the row below it".
// generateGrRegisterPdf used to draw every cell with pdf-lib's own
// `maxWidth` auto-wrap but a fixed 20pt row height - a long address that
// pdf-lib wrapped to 2-3 lines bled straight past that fixed boundary
// into the next row. wrapTextLines is the pure wrapping logic extracted
// so the real line count can be known BEFORE drawing, letting the row
// height grow to fit. Tested here with a synthetic monospace-style
// `measure` (size * chars) so it's deterministic and font-independent.

const monospace = (text: string, size: number) => text.length * size * 0.5;

describe('wrapTextLines', () => {
  it('keeps short text on a single line', () => {
    expect(wrapTextLines('KARACHI', 10, 200, monospace)).toEqual(['KARACHI']);
  });

  it('wraps long text across multiple lines instead of overflowing', () => {
    const longAddress = 'HOUSE #1001 BLOCK # 8, F.B ROYAL RESIDENCY, KARACHI, PAKISTAN';
    const lines = wrapTextLines(longAddress, 7, 110, monospace);
    expect(lines.length).toBeGreaterThan(1);
    // No line exceeds the given width at the given size.
    for (const line of lines) {
      expect(monospace(line, 7)).toBeLessThanOrEqual(110);
    }
    // Every word survives the wrap, in order, none dropped or duplicated.
    expect(lines.join(' ').split(/\s+/)).toEqual(longAddress.split(/\s+/));
  });

  it('never produces a blank cell for empty/undefined input', () => {
    expect(wrapTextLines('', 10, 100, monospace)).toEqual(['—']);
    expect(wrapTextLines(undefined as any, 10, 100, monospace)).toEqual(['—']);
    expect(wrapTextLines('   ', 10, 100, monospace)).toEqual(['—']);
  });

  it('still places one very long single word on its own line rather than looping forever', () => {
    const noSpaces = 'Supercalifragilisticexpialidocious-Street-Karachi-Pakistan';
    const lines = wrapTextLines(noSpaces, 10, 20, monospace);
    expect(lines).toEqual([noSpaces]);
  });

  it('produces more lines for a longer address than a shorter one at the same width', () => {
    const short = wrapTextLines('House 5, Gulberg', 7, 80, monospace);
    const long = wrapTextLines('House 5, Block 8, F.B Area, Near Royal Residency, Gulberg Town, Karachi, Sindh, Pakistan', 7, 80, monospace);
    expect(long.length).toBeGreaterThan(short.length);
  });
});
