import { describe, expect, it } from 'vitest';
import { decodeEntities, htmlToText, sanitizeDescription, summarize } from '../src/index.ts';

describe('sanitizeDescription', () => {
  it('removes scripts, styles, iframes and event handlers', () => {
    const html = '<p onclick="x()">Hi<script>alert(1)</script></p><style>p{}</style><iframe src="https://evil.test"></iframe><img src=x onerror=alert(1)>';
    const out = sanitizeDescription(html)!;
    expect(out).toBe('<p>Hi</p>');
  });
  it('drops javascript: links and hardens real links', () => {
    expect(sanitizeDescription('<a href="javascript:alert(1)">x</a>')).toBe('<a rel="noopener noreferrer nofollow" target="_blank">x</a>');
    expect(sanitizeDescription('<a href="https://ok.test" style="color:red">ok</a>')).toBe(
      '<a href="https://ok.test" rel="noopener noreferrer nofollow" target="_blank">ok</a>',
    );
  });
  it('downgrades h1/h2 and strips inline styles', () => {
    expect(sanitizeDescription('<h1 style="x">Title</h1><h2>Sub</h2>')).toBe('<h3>Title</h3><h3>Sub</h3>');
  });
  it('decodes entity-escaped HTML first (Greenhouse)', () => {
    expect(sanitizeDescription('&lt;p&gt;&lt;strong&gt;About&lt;/strong&gt;&lt;/p&gt;', { escaped: true })).toBe(
      '<p><strong>About</strong></p>',
    );
  });
  it('does not execute escaped scripts after decoding', () => {
    expect(sanitizeDescription('&lt;script&gt;alert(1)&lt;/script&gt;&lt;p&gt;ok&lt;/p&gt;', { escaped: true })).toBe('<p>ok</p>');
  });
  it('returns null for empty input', () => {
    expect(sanitizeDescription('')).toBeNull();
    expect(sanitizeDescription('<script>x</script>')).toBeNull();
  });
});

describe('htmlToText', () => {
  it('keeps paragraph and list breaks', () => {
    expect(htmlToText('<p>One</p><p>Two &amp; three</p><ul><li>A</li><li>B</li></ul>')).toBe('One\nTwo & three\n• A\n• B');
  });
  it('removes script contents', () => {
    expect(htmlToText('<p>a</p><script>var x = 1</script>')).toBe('a');
  });
});

describe('decodeEntities', () => {
  it('decodes named and numeric entities', () => {
    expect(decodeEntities('Finland&#x27;s &amp; caf&eacute; &#8212; &nbsp;x')).toBe("Finland's & café —  x");
  });
});

describe('summarize', () => {
  it('cuts on a word boundary', () => {
    const s = summarize('word '.repeat(100), 50)!;
    expect(s.length).toBeLessThanOrEqual(51);
    expect(s.endsWith('…')).toBe(true);
    expect(s).not.toMatch(/wor…$/);
  });
  it('keeps short text as is', () => expect(summarize('Short text')).toBe('Short text'));
});
