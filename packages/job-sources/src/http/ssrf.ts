import { lookup as dnsLookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  ['64:ff9b::', 96],
  ['2001:db8::', 32],
] as const) {
  blocked.addSubnet(net, prefix, 'ipv6');
}

/** True for loopback, private, link-local, CGNAT, multicast, reserved and documentation ranges. */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return blocked.check(address, 'ipv4');
  if (family === 6) {
    const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return blocked.check(mapped[1]!, 'ipv4');
    return blocked.check(address, 'ipv6');
  }
  return true; // not an IP at all: refuse
}

export class SsrfError extends Error {
  override name = 'SsrfError';
}

export type Resolver = (hostname: string) => Promise<string[]>;

export const systemResolver: Resolver = async (hostname) =>
  (await dnsLookup(hostname, { all: true, verbatim: true })).map((r) => r.address);

/**
 * Validates an outbound URL before connecting: https only, no credentials, no non-standard
 * ports, host must not be (or resolve to) a blocked address, and must match the allowlist.
 */
export async function assertSafeUrl(
  raw: string | URL,
  { allowedHosts, resolve = systemResolver }: { allowedHosts?: readonly string[]; resolve?: Resolver } = {},
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SsrfError(`Invalid URL`);
  }
  if (url.protocol !== 'https:') throw new SsrfError(`Blocked scheme ${url.protocol} (only https is allowed)`);
  if (url.username || url.password) throw new SsrfError('Credentials in URL are not allowed');
  if (url.port && url.port !== '443') throw new SsrfError(`Blocked port ${url.port}`);
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new SsrfError(`Blocked host ${host}`);
  }
  if (isIP(host) && isBlockedAddress(host)) throw new SsrfError(`Blocked address ${host}`);
  if (allowedHosts && !hostAllowed(host, allowedHosts)) throw new SsrfError(`Host ${host} is not in the allowlist`);
  if (isIP(host)) return url;
  let addresses: string[];
  try {
    addresses = await resolve(host);
  } catch (err) {
    throw new SsrfError(`DNS lookup failed for ${host}: ${(err as Error).message}`);
  }
  if (!addresses.length) throw new SsrfError(`No addresses for ${host}`);
  const bad = addresses.find(isBlockedAddress);
  if (bad) throw new SsrfError(`Host ${host} resolves to blocked address ${bad}`);
  return url;
}

/** "example.com" allows example.com and any subdomain; "*.x" is accepted as a synonym. */
export function hostAllowed(host: string, allowed: readonly string[]): boolean {
  return allowed.some((a) => {
    const base = a.replace(/^\*\./, '').toLowerCase();
    return host === base || host.endsWith(`.${base}`);
  });
}
