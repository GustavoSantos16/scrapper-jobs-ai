import { describe, expect, it } from 'vitest';
import {
  assertSafeUrl,
  HttpClient,
  isBlockedAddress,
  isPathAllowed,
  parseRobots,
  redact,
  type CachedResponse,
  type Transport,
} from '../src/index.ts';

const PUBLIC = async () => ['93.184.215.14'];

function stream(text: string): AsyncIterable<Uint8Array> {
  return (async function* () {
    yield new TextEncoder().encode(text);
  })();
}

/** Scripted transport: each call pops the next response. */
function scripted(responses: { status: number; headers?: Record<string, string>; body?: string }[]) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const t: Transport = async (url, init) => {
    calls.push({ url, headers: init.headers });
    const r = responses.shift();
    if (!r) throw new Error('no more scripted responses');
    return { status: r.status, headers: new Headers(r.headers), body: r.body === undefined ? null : stream(r.body) };
  };
  return { t, calls };
}

function client(t: Transport, over: Partial<ConstructorParameters<typeof HttpClient>[0]> = {}) {
  return new HttpClient({ allowedHosts: ['example.com'], transport: t, resolve: PUBLIC, minDelayMs: 0, sleep: async () => undefined, ...over });
}

describe('SSRF guard', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.10', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '224.0.0.1'])(
    'blocks %s',
    (ip) => expect(isBlockedAddress(ip)).toBe(true),
  );
  it.each(['93.184.215.14', '8.8.8.8', '2606:4700:4700::1111'])('allows public %s', (ip) => expect(isBlockedAddress(ip)).toBe(false));

  it('rejects non-https, credentials, odd ports and localhost names', async () => {
    await expect(assertSafeUrl('http://example.com/', { resolve: PUBLIC })).rejects.toThrow(/scheme/);
    await expect(assertSafeUrl('file:///etc/passwd', { resolve: PUBLIC })).rejects.toThrow(/scheme/);
    await expect(assertSafeUrl('https://user:pw@example.com/', { resolve: PUBLIC })).rejects.toThrow(/Credentials/);
    await expect(assertSafeUrl('https://example.com:8443/', { resolve: PUBLIC })).rejects.toThrow(/port/);
    await expect(assertSafeUrl('https://localhost/', { resolve: PUBLIC })).rejects.toThrow(/Blocked host/);
    await expect(assertSafeUrl('https://127.0.0.1/', { resolve: PUBLIC })).rejects.toThrow(/Blocked address/);
    await expect(assertSafeUrl('https://[::1]/', { resolve: PUBLIC })).rejects.toThrow(/Blocked address/);
  });

  it('rejects hostnames that resolve to private addresses (DNS rebinding)', async () => {
    await expect(assertSafeUrl('https://evil.example.com/', { resolve: async () => ['93.184.215.14', '10.0.0.5'] })).rejects.toThrow(
      /resolves to blocked address 10\.0\.0\.5/,
    );
  });

  it('enforces the host allowlist including subdomains', async () => {
    await expect(assertSafeUrl('https://api.example.com/x', { allowedHosts: ['example.com'], resolve: PUBLIC })).resolves.toBeInstanceOf(URL);
    await expect(assertSafeUrl('https://example.com.evil.net/x', { allowedHosts: ['example.com'], resolve: PUBLIC })).rejects.toThrow(/allowlist/);
  });
});

describe('HttpClient', () => {
  it('re-validates redirects and refuses a redirect to a private address', async () => {
    const { t } = scripted([{ status: 302, headers: { location: 'https://127.0.0.1/admin' } }]);
    await expect(client(t).getText('https://example.com/a')).rejects.toThrow(/Blocked address/);
  });

  it('refuses a redirect to a host outside the allowlist', async () => {
    const { t } = scripted([{ status: 301, headers: { location: 'https://other.net/x' } }]);
    await expect(client(t).getText('https://example.com/a')).rejects.toThrow(/allowlist/);
  });

  it('follows a safe redirect', async () => {
    const { t, calls } = scripted([
      { status: 301, headers: { location: '/b' } },
      { status: 200, body: 'ok' },
    ]);
    expect(await client(t).getText('https://example.com/a')).toBe('ok');
    expect(calls.map((c) => c.url)).toEqual(['https://example.com/a', 'https://example.com/b']);
  });

  it('caps the response size', async () => {
    const { t } = scripted([{ status: 200, body: 'x'.repeat(2048) }]);
    await expect(client(t, { maxBytes: 1024 }).getText('https://example.com/big')).rejects.toThrow(/exceeds 1024 bytes/);
  });

  it('retries 503/429 with backoff, up to 3 attempts', async () => {
    const waits: number[] = [];
    const { t, calls } = scripted([{ status: 503 }, { status: 429, headers: { 'retry-after': '2' } }, { status: 200, body: '{"ok":1}' }]);
    const c = client(t, { sleep: async (ms) => void waits.push(ms) });
    expect(await c.getJson('https://example.com/j')).toEqual({ ok: 1 });
    expect(calls).toHaveLength(3);
    expect(waits).toEqual([1000, 2000]);
  });

  it('gives up after 3 attempts', async () => {
    const { t, calls } = scripted([{ status: 500 }, { status: 502 }, { status: 503 }, { status: 200, body: 'never' }]);
    await expect(client(t).getText('https://example.com/x')).rejects.toThrow(/HTTP 503/);
    expect(calls).toHaveLength(3);
  });

  it('does not retry client errors', async () => {
    const { t, calls } = scripted([{ status: 404 }, { status: 200, body: 'x' }]);
    await expect(client(t).getText('https://example.com/x')).rejects.toThrow(/HTTP 404/);
    expect(calls).toHaveLength(1);
  });

  it('uses ETag / If-Modified-Since and serves 304 from cache', async () => {
    const store = new Map<string, CachedResponse>();
    const cache = { get: (u: string) => store.get(u), set: (u: string, e: CachedResponse) => void store.set(u, e) };
    const { t, calls } = scripted([
      { status: 200, headers: { etag: '"v1"', 'last-modified': 'Mon, 19 Oct 2026 07:31:25 GMT' }, body: 'fresh' },
      { status: 304 },
    ]);
    const c = client(t, { cache });
    expect(await c.getText('https://example.com/feed')).toBe('fresh');
    const second = await c.request('https://example.com/feed');
    expect(second.fromCache).toBe(true);
    expect(second.text()).toBe('fresh');
    expect(calls[1]!.headers['if-none-match']).toBe('"v1"');
    expect(calls[1]!.headers['if-modified-since']).toBe('Mon, 19 Oct 2026 07:31:25 GMT');
  });

  it('honors robots.txt when asked to', async () => {
    const { t } = scripted([{ status: 200, body: 'User-agent: *\nDisallow: /private' }]);
    await expect(client(t, { respectRobots: true }).getText('https://example.com/private/x')).rejects.toThrow(/robots\.txt disallows/);
  });

  it('can be cancelled', async () => {
    const ac = new AbortController();
    ac.abort(new Error('cancelled by user'));
    const { t } = scripted([{ status: 200, body: 'x' }]);
    await expect(client(t, { signal: ac.signal }).getText('https://example.com/x')).rejects.toThrow(/cancelled/);
  });

  it('never leaks secrets in error messages', async () => {
    const { t } = scripted([{ status: 404 }]);
    const err = await client(t, { secrets: ['supersecretkey'] })
      .getText('https://example.com/api/supersecretkey?app_key=abc123')
      .catch((e: Error) => e);
    expect(String(err)).not.toContain('supersecretkey');
    expect(String(err)).not.toContain('abc123');
    expect(redact('https://x.test/?app_id=1&app_key=zzz', [])).toBe('https://x.test/?app_id=1&app_key=***');
  });
});

describe('robots.txt parser', () => {
  const txt = `User-agent: AhrefsBot\nDisallow: /\n\nUser-agent: *\nCrawl-delay: 1\nDisallow: /*?action=get_jobs\nDisallow: /admin/\nAllow: /admin/public\n`;
  const rules = parseRobots(txt, 'AIJobHunter/0.1');
  it.each([
    ['/api', true],
    ['/admin/x', false],
    ['/admin/public/page', true],
    ['/remote-jobs?action=get_jobs', false],
  ])('%s → %s', (path, allowed) => expect(isPathAllowed(rules, path)).toBe(allowed));
  it('treats an empty Disallow as allow-all', () => {
    expect(isPathAllowed(parseRobots('User-agent: *\nDisallow:', 'x'), '/anything')).toBe(true);
  });
});
