import { readFileSync } from 'fs';
import sanitizeHtml from 'sanitize-html';

// Tags/attributes a teacher's rich-text diary entry is actually allowed to
// produce via the frontend editor (bold/italic/underline, bullet and
// numbered lists, font-size/font-family spans, and a per-block `dir` for
// Urdu/RTL text). Anything else submitted directly against the API
// (bypassing the editor) is stripped rather than trusted.
const RICH_TEXT_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'span', 'div'],
  allowedAttributes: {
    '*': ['dir'],
    span: ['style'],
    p: ['style'],
    div: ['style'],
  },
  allowedStyles: {
    '*': {
      'font-size': [/^\d+(?:\.\d+)?(px|pt|em|%)$/],
      'font-family': [/^[a-zA-Z0-9\s,'"-]+$/],
      'font-weight': [/^(bold|normal|\d+)$/],
      'font-style': [/^(italic|normal)$/],
      'text-decoration': [/^(underline|none)$/],
    },
  },
};

/** Sanitizes a diary rich-text field down to the small, known-safe set of
 * tags/attributes the editor itself produces - defense-in-depth against a
 * caller hitting the API directly with arbitrary HTML, since this content
 * is later rendered verbatim (not re-escaped) both in the PDF and to
 * parents/other staff. Plain text with no tags at all passes through
 * untouched. */
export function sanitizeRichText(value: string | null | undefined): string {
  if (!value) return '';
  return sanitizeHtml(value, RICH_TEXT_SANITIZE_OPTIONS).trim();
}

export function escapeHtml(value: string | null | undefined): string {
  if (!value) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ARABIC_SCRIPT_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

/** True if the text contains any Arabic-script character (Urdu, Arabic, etc). */
export function containsArabicScript(value: string | null | undefined): boolean {
  return !!value && ARABIC_SCRIPT_RE.test(value);
}

let cachedUrduFontDataUri: string | null = null;

/**
 * Base64 `data:` URI for the Noto Nastaliq Urdu font, read once and
 * cached. A PDF built from HTML (via Puppeteer/Chromium) only shapes
 * Arabic-script text correctly - letters properly joined, not drawn as
 * disconnected isolated glyphs - when a font that actually supports
 * Arabic shaping is available to the page. Relying on whatever font the
 * container happens to have installed produced exactly the "letters not
 * joined" rendering a teacher reported on a downloaded Class Diary PDF.
 * Embedding the font directly via @font-face removes that dependency on
 * the container's installed fonts entirely.
 */
export function getUrduFontDataUri(): string {
  if (!cachedUrduFontDataUri) {
    const fontPath = require.resolve('@fontsource/noto-nastaliq-urdu/files/noto-nastaliq-urdu-arabic-400-normal.woff2');
    const bytes = readFileSync(fontPath);
    cachedUrduFontDataUri = `data:font/woff2;base64,${bytes.toString('base64')}`;
  }
  return cachedUrduFontDataUri;
}

/** The @font-face + fallback-list CSS needed to make Urdu/Arabic text
 * render with proper letter joining anywhere in a Puppeteer-rendered PDF
 * template - include once per template's <style> block, then list
 * 'Noto Nastaliq Urdu' in any font-family stack that may contain Urdu
 * text (the browser picks it per-glyph, so Latin text in the same
 * element still renders in the stack's other fonts). */
export function urduFontFaceCss(): string {
  return `@font-face {
    font-family: 'Noto Nastaliq Urdu';
    src: url(${getUrduFontDataUri()}) format('woff2');
    font-weight: 400;
    font-style: normal;
    font-display: swap;
  }`;
}

const cachedLatinFontDataUris: Record<string, string> = {};

/**
 * Base64 `data:` URI for one weight of the Inter font, read once per
 * weight and cached. A template whose layout math was tuned against
 * whatever sans-serif font happened to be installed on the machine it was
 * tuned on (e.g. 'Segoe UI', which doesn't even exist outside Windows)
 * renders with a DIFFERENT fallback font - with different line-height and
 * character-width metrics - on whatever machine Puppeteer/Chromium
 * actually runs on in production, silently making every line of text a
 * little taller or wider than the font the layout was tuned against. On a
 * report already fitted tightly to one printable page, that's enough to
 * push its last line onto an otherwise-blank 2nd page - and because it
 * depends on host font availability, it reproduces inconsistently between
 * a developer's machine and the production container, exactly what made
 * this class of bug so hard to pin down. Embedding a specific font
 * directly, the same way getUrduFontDataUri() already does for Urdu text,
 * removes that dependency on the host's installed fonts entirely so the
 * layout is pixel-identical everywhere this code runs.
 */
export function getLatinFontDataUri(weight: 400 | 700): string {
  const key = String(weight);
  if (!cachedLatinFontDataUris[key]) {
    const fontPath = require.resolve(`@fontsource/inter/files/inter-latin-${weight}-normal.woff2`);
    const bytes = readFileSync(fontPath);
    cachedLatinFontDataUris[key] = `data:font/woff2;base64,${bytes.toString('base64')}`;
  }
  return cachedLatinFontDataUris[key];
}

/** The @font-face CSS needed to make a template's Latin text render in a
 * specific, embedded font instead of whatever sans-serif the host
 * happens to have installed - see getLatinFontDataUri() for why that
 * matters for any template whose layout is tuned to fit one printable
 * page. Include once per template's <style> block, then list 'Inter'
 * first in that template's font-family stacks. */
export function latinFontFaceCss(): string {
  return `@font-face {
    font-family: 'Inter';
    src: url(${getLatinFontDataUri(400)}) format('woff2');
    font-weight: 400;
    font-style: normal;
    font-display: block;
  }
  @font-face {
    font-family: 'Inter';
    src: url(${getLatinFontDataUri(700)}) format('woff2');
    font-weight: 700;
    font-style: normal;
    font-display: block;
  }`;
}

/** Renders a diary field's stored value as safe HTML for a Puppeteer PDF
 * template. Values saved by the rich-text editor are already (sanitized)
 * HTML and are trusted as block-level content, re-sanitized here only as
 * defense-in-depth. Legacy plain-text values (saved before the editor
 * existed, or any value with no HTML tags at all) are escaped and, if the
 * text is Urdu/Arabic, wrapped in a right-to-left block so it reads
 * correctly instead of at the ltr default. */
export function renderRichTextField(raw: string | null | undefined): string {
  if (!raw) return '';
  const looksLikeHtml = /<[a-z][\s\S]*>/i.test(raw);
  if (looksLikeHtml) return sanitizeRichText(raw);
  const escaped = escapeHtml(raw);
  return containsArabicScript(raw) ? `<div dir="rtl">${escaped}</div>` : escaped;
}
