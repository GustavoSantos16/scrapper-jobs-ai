import { readFileSync } from 'node:fs';
import { DEFAULT_PROFILE } from '@ajh/shared';
import { HttpClient, type Transport } from './http/client.ts';
import type { AnyConnector, ConnectorContext } from './types.ts';

/**
 * Transport that serves recorded fixtures instead of the network. `routes` maps a URL
 * substring (or RegExp) to a fixture file path or a status code.
 */
export function fixtureTransport(routes: [string | RegExp, string | number | (() => string)][]): Transport & { calls: string[] } {
  const calls: string[] = [];
  const transport = (async (url: string) => {
    calls.push(url);
    const hit = routes.find(([pattern]) => (typeof pattern === 'string' ? url.includes(pattern) : pattern.test(url)));
    if (!hit) return { status: 404, headers: new Headers(), body: null };
    const [, target] = hit;
    if (typeof target === 'number') return { status: target, headers: new Headers(), body: null };
    const text = typeof target === 'function' ? target() : readFileSync(target, 'utf8');
    return { status: 200, headers: new Headers({ 'content-type': 'application/json' }), body: toStream(text) };
  }) as unknown as Transport & { calls: string[] };
  transport.calls = calls;
  return transport;
}

async function* toStream(text: string): AsyncIterable<Uint8Array> {
  yield new TextEncoder().encode(text);
}

const silent = { debug() {}, info() {}, warn() {} };

/** Context for running a connector against fixtures (no network, no delays, public DNS stub). */
export function fixtureContext(connector: Pick<AnyConnector, 'allowedHosts' | 'rateLimit'>, transport: Transport, over: Partial<ConnectorContext> = {}): ConnectorContext {
  const signal = over.signal ?? new AbortController().signal;
  return {
    http: new HttpClient({
      allowedHosts: connector.allowedHosts,
      transport,
      resolve: async () => ['93.184.215.14'],
      minDelayMs: 0,
      maxRequests: connector.rateLimit.maxRequestsPerRun,
      respectRobots: false,
      signal,
      sleep: async () => undefined,
    }),
    profile: DEFAULT_PROFILE,
    signal,
    log: silent,
    now: new Date('2026-10-20T21:00:00Z'),
    env: {},
    companies: [],
    ...over,
  };
}

export async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}
