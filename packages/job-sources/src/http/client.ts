import { lookup as dnsLookupCb, type LookupAddress } from 'node:dns';
import { Agent, fetch as undiciFetch } from 'undici';
import { isPathAllowed, parseRobots } from './robots.ts';
import { assertSafeUrl, isBlockedAddress, SsrfError, systemResolver, type Resolver } from './ssrf.ts';

export const USER_AGENT = 'AIJobHunter/0.1 (personal, non-commercial job aggregator)';

export interface CachedResponse {
  etag: string | null;
  lastModified: string | null;
  status: number;
  contentType: string | null;
  body: Buffer;
  fetchedAt: string;
}

export interface HttpCacheStore {
  get(url: string): CachedResponse | undefined;
  set(url: string, entry: CachedResponse): void;
}

export interface Transport {
  (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal: AbortSignal }): Promise<{
    status: number;
    headers: Headers;
    body: AsyncIterable<Uint8Array> | null;
  }>;
}

export interface HttpResponse {
  url: string;
  status: number;
  headers: Headers;
  body: Buffer;
  fromCache: boolean;
  text(): string;
  json<T = unknown>(): T;
}

export interface RequestOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  /** Bypass/skip the conditional cache (e.g. POST or volatile endpoints). */
  cache?: boolean;
  /** Override the client default. */
  maxBytes?: number;
  timeoutMs?: number;
}

export interface HttpClientOptions {
  /** Hostnames (and their subdomains) this client may contact. */
  allowedHosts: readonly string[];
  /** Strings that must never appear in logs/errors (API keys). */
  secrets?: string[];
  signal?: AbortSignal;
  cache?: HttpCacheStore;
  /** Minimum spacing between requests in ms (per client, i.e. per source). */
  minDelayMs?: number;
  /** Hard cap of requests for this client (per run). */
  maxRequests?: number;
  maxBytes?: number;
  timeoutMs?: number;
  maxRetries?: number;
  /** Check robots.txt before each request (feeds and public pages). */
  respectRobots?: boolean;
  transport?: Transport;
  resolve?: Resolver;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  onRequest?: (info: { url: string; status: number | null; fromCache: boolean; attempt: number; ms: number }) => void;
}

export class HttpError extends Error {
  override name = 'HttpError';
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export class RequestBudgetError extends Error {
  override name = 'RequestBudgetError';
}

export class RobotsDisallowedError extends Error {
  override name = 'RobotsDisallowedError';
}

const MAX_REDIRECTS = 5;

/**
 * Undici agent whose DNS lookup refuses blocked addresses at connect time. This closes the
 * DNS-rebinding gap between validating a hostname and opening the socket.
 */
function guardedAgent(): Agent {
  return new Agent({
    connect: {
      lookup(hostname, options, callback) {
        dnsLookupCb(hostname, { ...options, all: true }, (err, addresses) => {
          if (err) return callback(err, '', 0);
          const list = addresses as LookupAddress[];
          const bad = list.find((a) => isBlockedAddress(a.address));
          if (bad) return callback(new SsrfError(`Blocked address ${bad.address} for ${hostname}`), '', 0);
          if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list);
          const first = list[0]!;
          callback(null, first.address, first.family);
        });
      },
    },
    headersTimeout: 30_000,
    bodyTimeout: 30_000,
  });
}

let sharedAgent: Agent | null = null;

export const defaultTransport: Transport = async (url, init) => {
  sharedAgent ??= guardedAgent();
  const res = await undiciFetch(url, { ...init, redirect: 'manual', dispatcher: sharedAgent });
  return { status: res.status, headers: res.headers as unknown as Headers, body: res.body };
};

export const abortableSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal!.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

export function redact(text: string, secrets: readonly string[] = []): string {
  let out = text;
  for (const s of secrets) if (s && s.length >= 4) out = out.split(s).join('***');
  return out.replace(/([?&](app_key|api_key|apikey|key|token)=)[^&\s]+/gi, '$1***');
}

/**
 * Outbound HTTP for connectors. Every request: SSRF-validated URL (https, allowlisted host,
 * no private IPs), manual redirects re-validated per hop, response size cap, timeout,
 * per-source spacing and request budget, retry with exponential backoff on 429/5xx/network
 * errors (max 3 attempts), conditional cache with ETag/Last-Modified.
 */
export class HttpClient {
  private readonly opts: Required<
    Pick<HttpClientOptions, 'minDelayMs' | 'maxRequests' | 'maxBytes' | 'timeoutMs' | 'maxRetries'>
  > &
    HttpClientOptions;
  private lastRequestAt = 0;
  private queue: Promise<void> = Promise.resolve();
  private robots = new Map<string, ReturnType<typeof parseRobots>>();
  requestCount = 0;

  constructor(options: HttpClientOptions) {
    this.opts = {
      minDelayMs: 1000,
      maxRequests: 50,
      maxBytes: 15 * 1024 * 1024,
      timeoutMs: 30_000,
      maxRetries: 3,
      ...options,
    };
  }

  async getJson<T = unknown>(url: string, opts: RequestOptions = {}): Promise<T> {
    return (await this.request(url, { ...opts, headers: { accept: 'application/json', ...opts.headers } })).json<T>();
  }

  async getText(url: string, opts: RequestOptions = {}): Promise<string> {
    return (await this.request(url, opts)).text();
  }

  async request(rawUrl: string, opts: RequestOptions = {}): Promise<HttpResponse> {
    const method = opts.method ?? 'GET';
    const useCache = (opts.cache ?? true) && method === 'GET' && this.opts.cache;
    const cached = useCache ? this.opts.cache!.get(rawUrl) : undefined;
    const maxAttempts = Math.max(1, this.opts.maxRetries);

    if (this.opts.respectRobots) await this.checkRobots(rawUrl);

    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      this.opts.signal?.throwIfAborted();
      const started = Date.now();
      try {
        const res = await this.once(rawUrl, method, opts, cached);
        this.opts.onRequest?.({ url: this.safe(rawUrl), status: res.status, fromCache: res.fromCache, attempt, ms: Date.now() - started });
        return res;
      } catch (err) {
        lastError = err;
        const retryable = err instanceof HttpError ? err.retryable : !(err instanceof SsrfError || err instanceof RequestBudgetError || err instanceof RobotsDisallowedError || isAbort(err, this.opts.signal));
        this.opts.onRequest?.({ url: this.safe(rawUrl), status: err instanceof HttpError ? err.status : null, fromCache: false, attempt, ms: Date.now() - started });
        if (!retryable || attempt === maxAttempts) break;
        const retryAfter = (err as { retryAfterMs?: number }).retryAfterMs;
        const backoff = Math.min(60_000, retryAfter ?? 1000 * 2 ** (attempt - 1));
        await (this.opts.sleep ?? abortableSleep)(backoff, this.opts.signal);
      }
    }
    throw this.sanitizeError(lastError);
  }

  private async once(rawUrl: string, method: string, opts: RequestOptions, cached: CachedResponse | undefined): Promise<HttpResponse> {
    await this.throttle();
    if (this.requestCount >= this.opts.maxRequests) {
      throw new RequestBudgetError(`Request budget of ${this.opts.maxRequests} per run exhausted`);
    }
    this.requestCount++;

    const timeout = AbortSignal.timeout(opts.timeoutMs ?? this.opts.timeoutMs);
    const signal = this.opts.signal ? AbortSignal.any([this.opts.signal, timeout]) : timeout;
    const headers: Record<string, string> = { 'user-agent': USER_AGENT, 'accept-encoding': 'gzip, br', ...opts.headers };
    if (cached?.etag) headers['if-none-match'] = cached.etag;
    if (cached?.lastModified) headers['if-modified-since'] = cached.lastModified;

    let url = rawUrl;
    for (let hop = 0; ; hop++) {
      await assertSafeUrl(url, { allowedHosts: this.opts.allowedHosts, resolve: this.opts.resolve ?? systemResolver });
      const res = await (this.opts.transport ?? defaultTransport)(url, {
        method: hop === 0 ? method : 'GET',
        headers,
        ...(hop === 0 && opts.body !== undefined && { body: opts.body }),
        signal,
      });
      if (res.status >= 300 && res.status < 400 && res.status !== 304) {
        await drain(res.body);
        const location = res.headers.get('location');
        if (!location) throw new HttpError(`Redirect ${res.status} without Location`, res.status, false);
        if (hop >= MAX_REDIRECTS) throw new HttpError('Too many redirects', res.status, false);
        url = new URL(location, url).toString();
        continue;
      }
      if (res.status === 304 && cached) {
        await drain(res.body);
        return makeResponse(url, cached.status, res.headers, cached.body, true);
      }
      if (res.status === 429 || res.status >= 500) {
        await drain(res.body);
        const err = new HttpError(`HTTP ${res.status} from ${this.safe(url)}`, res.status, true) as HttpError & { retryAfterMs?: number };
        const ra = Number(res.headers.get('retry-after'));
        if (Number.isFinite(ra) && ra > 0) err.retryAfterMs = ra * 1000;
        throw err;
      }
      if (res.status >= 400) {
        await drain(res.body);
        throw new HttpError(`HTTP ${res.status} from ${this.safe(url)}`, res.status, false);
      }
      const body = await readCapped(res.body, opts.maxBytes ?? this.opts.maxBytes);
      if (this.opts.cache && method === 'GET' && (opts.cache ?? true)) {
        const etag = res.headers.get('etag');
        const lastModified = res.headers.get('last-modified');
        if (etag || lastModified) {
          this.opts.cache.set(rawUrl, {
            etag,
            lastModified,
            status: res.status,
            contentType: res.headers.get('content-type'),
            body,
            fetchedAt: new Date().toISOString(),
          });
        }
      }
      return makeResponse(url, res.status, res.headers, body, false);
    }
  }

  /** Serializes requests of this client and spaces them by minDelayMs. */
  private throttle(): Promise<void> {
    const next = this.queue.then(async () => {
      const wait = this.lastRequestAt + this.opts.minDelayMs - Date.now();
      if (wait > 0 && this.lastRequestAt) await (this.opts.sleep ?? abortableSleep)(wait, this.opts.signal);
      this.lastRequestAt = Date.now();
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async checkRobots(rawUrl: string): Promise<void> {
    const u = new URL(rawUrl);
    let rules = this.robots.get(u.origin);
    if (!rules) {
      try {
        const res = await this.once(`${u.origin}/robots.txt`, 'GET', { cache: true, maxBytes: 512 * 1024 }, this.opts.cache?.get(`${u.origin}/robots.txt`));
        rules = parseRobots(res.text(), USER_AGENT);
      } catch (err) {
        // RFC 9309: a missing robots.txt (4xx) means no restrictions; other failures are fatal
        if (err instanceof HttpError && err.status !== null && err.status >= 400 && err.status < 500) rules = [];
        else throw err;
      }
      this.robots.set(u.origin, rules);
    }
    if (!isPathAllowed(rules, `${u.pathname}${u.search}`)) {
      throw new RobotsDisallowedError(`robots.txt disallows ${u.pathname}`);
    }
  }

  private safe(url: string): string {
    return redact(url, this.opts.secrets);
  }

  private sanitizeError(err: unknown): unknown {
    if (err instanceof Error && this.opts.secrets?.length) err.message = redact(err.message, this.opts.secrets);
    return err;
  }
}

function isAbort(err: unknown, signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted) || (err instanceof Error && (err.name === 'AbortError'));
}

function makeResponse(url: string, status: number, headers: Headers, body: Buffer, fromCache: boolean): HttpResponse {
  return {
    url,
    status,
    headers,
    body,
    fromCache,
    text: () => body.toString('utf8'),
    json: <T>() => {
      try {
        return JSON.parse(body.toString('utf8')) as T;
      } catch {
        throw new HttpError(`Invalid JSON from ${new URL(url).host}`, status, false);
      }
    },
  };
}

async function drain(body: AsyncIterable<Uint8Array> | null): Promise<void> {
  if (!body) return;
  try {
    for await (const _ of body) {
      /* discard */
    }
  } catch {
    /* ignore */
  }
}

export async function readCapped(body: AsyncIterable<Uint8Array> | null, maxBytes: number): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of body) {
    size += chunk.byteLength;
    if (size > maxBytes) throw new HttpError(`Response exceeds ${maxBytes} bytes`, null, false);
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
