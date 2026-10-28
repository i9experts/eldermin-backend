import { sanitizeRichText, escapeHtml, containsArabicScript, getUrduFontDataUri, renderRichTextField } from './rich-text.util';

// Pins two fixes shipped together for the Class Diary feature:
// 1. The downloaded Class Diary PDF showed Urdu text with disconnected
//    letters because Puppeteer/Chromium had no font installed that could
//    actually shape Arabic script - getUrduFontDataUri embeds a real font
//    file directly into the PDF's HTML so rendering never depends on
//    whatever fonts happen to be on the container.
// 2. Diary content moved from plain text to HTML (from a new rich-text
//    editor) - sanitizeRichText/renderRichTextField are the only things
//    standing between a teacher's (or a direct API caller's) submitted
//    HTML and it being rendered unescaped into a PDF and to parents.

describe('sanitizeRichText', () => {
  it('keeps the small set of tags the editor actually produces', () => {
    const html = '<p>Hello <strong>world</strong></p><ul><li>one</li><li>two</li></ul>';
    expect(sanitizeRichText(html)).toBe(html);
  });

  it('strips a script tag and any inline event handler - the exact XSS shape a direct API call could submit', () => {
    const malicious = '<p onclick="steal()">hi</p><script>alert(1)</script><img src=x onerror=alert(2)>';
    const clean = sanitizeRichText(malicious);
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('onclick');
    expect(clean).not.toContain('onerror');
    expect(clean).not.toContain('<img');
  });

  it('keeps an allowed inline style (font-size, font-family, direction via dir attribute)', () => {
    const html = '<p dir="rtl" style="font-size: 16px; font-family: Noto Nastaliq Urdu">اردو</p>';
    const clean = sanitizeRichText(html);
    expect(clean).toContain('dir="rtl"');
    expect(clean).toContain('font-size:16px');
  });

  it('strips a disallowed style property (e.g. a position/url-based CSS injection)', () => {
    const html = '<p style="background: url(javascript:alert(1)); font-size: 14px">x</p>';
    const clean = sanitizeRichText(html);
    expect(clean).not.toContain('url(');
    expect(clean).toContain('font-size:14px');
  });

  it('leaves plain text with no tags untouched', () => {
    expect(sanitizeRichText('Just plain homework text')).toBe('Just plain homework text');
  });

  it('returns an empty string for null/undefined/empty input', () => {
    expect(sanitizeRichText(null)).toBe('');
    expect(sanitizeRichText(undefined)).toBe('');
    expect(sanitizeRichText('')).toBe('');
  });
});

describe('containsArabicScript', () => {
  it('detects Urdu text', () => expect(containsArabicScript('جماعت کا کام')).toBe(true));
  it('does not flag plain English text', () => expect(containsArabicScript('Sunnah Way of Eating')).toBe(false));
  it('handles null/undefined safely', () => {
    expect(containsArabicScript(null)).toBe(false);
    expect(containsArabicScript(undefined)).toBe(false);
  });
});

describe('escapeHtml', () => {
  it('escapes HTML metacharacters so a raw subject/title field can never inject markup', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
  it('passes plain text through unchanged', () => expect(escapeHtml('Maths')).toBe('Maths'));
});

describe('renderRichTextField', () => {
  it('wraps legacy plain-text Urdu content in a right-to-left block', () => {
    const out = renderRichTextField('جماعت کا کام');
    expect(out).toBe('<div dir="rtl">جماعت کا کام</div>');
  });

  it('does not add an rtl wrapper around plain English legacy text', () => {
    expect(renderRichTextField('Sunnah Way of Eating')).toBe('Sunnah Way of Eating');
  });

  it('trusts (and re-sanitizes) already-HTML content from the rich-text editor as-is, without an extra rtl wrapper', () => {
    const html = '<p dir="rtl">جماعت کا کام</p>';
    expect(renderRichTextField(html)).toBe(html);
  });

  it('returns an empty string for empty input', () => expect(renderRichTextField('')).toBe(''));
});

describe('getUrduFontDataUri', () => {
  it('returns a cached base64 woff2 data URI the Class Diary PDF template can embed directly', () => {
    const uri = getUrduFontDataUri();
    expect(uri).toMatch(/^data:font\/woff2;base64,[A-Za-z0-9+/]+=*$/);
    // Cached - a second call returns the exact same string without re-reading the file.
    expect(getUrduFontDataUri()).toBe(uri);
  });
});
