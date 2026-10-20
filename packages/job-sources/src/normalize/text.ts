import sanitizeHtml from 'sanitize-html';

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', bull: '•', middot: '·',
  copy: '©', reg: '®', trade: '™', euro: '€', pound: '£', eacute: 'é', aacute: 'á',
  iacute: 'í', oacute: 'ó', uacute: 'ú', atilde: 'ã', otilde: 'õ', ccedil: 'ç', ecirc: 'ê', acirc: 'â', ocirc: 'ô',
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

export function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Returns trimmed text or null for empty/whitespace-only input. */
export function cleanText(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = collapseWhitespace(decodeEntities(String(s)));
  return t.length ? t : null;
}

const ALLOWED_TAGS = [
  'p', 'br', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 'a', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'code', 'pre', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
];

/**
 * Sanitizes untrusted description HTML with an allowlist. Scripts, styles, iframes,
 * event handlers and non-http(s)/mailto links are removed. h1/h2 become h3 so a
 * description never competes with page headings.
 */
export function sanitizeDescription(html: string | null | undefined, { escaped = false } = {}): string | null {
  if (!html) return null;
  const source = escaped ? decodeEntities(html) : html;
  const out = sanitizeHtml(source, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ['href', 'rel', 'target'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript', 'iframe', 'svg'],
    transformTags: {
      h1: 'h3',
      h2: 'h3',
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, rel: 'noopener noreferrer nofollow', target: '_blank' },
      }),
    },
    exclusiveFilter: (frame) => ['p', 'li', 'h3', 'h4', 'strong', 'b', 'em'].includes(frame.tag) && !frame.text.trim(),
  }).trim();
  return out.length ? out : null;
}

/** Plain text from HTML, keeping paragraph/list breaks as newlines. */
export function htmlToText(html: string | null | undefined, { escaped = false } = {}): string | null {
  if (!html) return null;
  const source = escaped ? decodeEntities(html) : html;
  const withBreaks = source
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote|pre|ul|ol)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ');
  const stripped = sanitizeHtml(withBreaks, {
    allowedTags: [],
    allowedAttributes: {},
    nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript', 'iframe', 'svg'],
  });
  const text = decodeEntities(stripped)
    .split('\n')
    .map((l) => l.replace(/[ \t\u00a0]+/g, ' ').trim())
    .filter((l, i, all) => l.length || (i > 0 && all[i - 1]?.length))
    .join('\n')
    .trim();
  return text.length ? text : null;
}

/** First ~maxLen characters of text, cut on a word boundary. */
export function summarize(text: string | null | undefined, maxLen = 280): string | null {
  if (!text) return null;
  const flat = collapseWhitespace(text);
  if (flat.length <= maxLen) return flat;
  const cut = flat.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > maxLen * 0.6 ? lastSpace : maxLen).replace(/[,.;:\s]+$/, '')}…`;
}
