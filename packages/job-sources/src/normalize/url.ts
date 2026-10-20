const TRACKING_PARAMS = new Set([
  'ref', 'referrer', 'source', 'src', 'gh_src', 'lever-source', 'lever-origin', 'jobboardsource',
  'gclid', 'fbclid', 'msclkid', 'mc_cid', 'mc_eid', 'igshid', '_hsenc', '_hsmi', '__hstc', '__hssc',
]);

/**
 * Normalizes a URL for comparison: https, lowercase host without "www.", no fragment,
 * no tracking params (utm_* and known click IDs), sorted query, no trailing slash.
 * Returns null for unparseable or non-http(s) URLs.
 */
export function canonicalizeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const params = [...u.searchParams.entries()]
    .filter(([k]) => !k.toLowerCase().startsWith('utm_') && !TRACKING_PARAMS.has(k.toLowerCase()))
    .sort(([a], [b]) => a.localeCompare(b));
  const query = params.length ? `?${new URLSearchParams(params).toString()}` : '';
  const path = u.pathname.replace(/\/+$/, '') || '';
  const port = u.port && u.port !== '443' && u.port !== '80' ? `:${u.port}` : '';
  return `https://${host}${port}${path}${query}`;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/**
 * Extracts a stable ATS posting key ("greenhouse:123", "lever:<uuid>", …) from a URL.
 * The same posting syndicated by several boards usually links to the same ATS page.
 */
export function extractAtsKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const path = u.pathname;
  let m: RegExpMatchArray | null;

  if (host.endsWith('greenhouse.io')) {
    if ((m = path.match(/\/jobs\/(\d+)/))) return `greenhouse:${m[1]}`;
  }
  const ghJid = u.searchParams.get('gh_jid');
  if (ghJid && /^\d+$/.test(ghJid)) return `greenhouse:${ghJid}`;

  if (host === 'jobs.lever.co' || host === 'jobs.eu.lever.co') {
    if ((m = path.match(new RegExp(`^/[^/]+/(${UUID})`, 'i')))) return `lever:${m[1]!.toLowerCase()}`;
  }
  if (host === 'jobs.ashbyhq.com') {
    if ((m = path.match(new RegExp(`^/[^/]+/(${UUID})`, 'i')))) return `ashby:${m[1]!.toLowerCase()}`;
  }
  if (host === 'apply.workable.com' || host.endsWith('.workable.com')) {
    if ((m = path.match(/\/j\/([0-9A-F]{6,})/i))) return `workable:${m[1]!.toUpperCase()}`;
  }
  if (host.endsWith('.gupy.io')) {
    if ((m = path.match(/\/jobs\/(\d+)/))) return `gupy:${m[1]}`;
    if ((m = path.match(/\/job\/([A-Za-z0-9+/=_-]+)/))) {
      try {
        const decoded = JSON.parse(Buffer.from(decodeURIComponent(m[1]!), 'base64').toString('utf8')) as {
          jobId?: number;
        };
        if (decoded.jobId) return `gupy:${decoded.jobId}`;
      } catch {
        /* not a base64 job token */
      }
    }
  }
  if (host.endsWith('.recruitee.com') && (m = path.match(/\/o\/([\w-]+)/))) return `recruitee:${host.split('.')[0]}:${m[1]}`;
  if (host.endsWith('.bamboohr.com') && (m = path.match(/\/careers\/(\d+)/))) return `bamboohr:${host.split('.')[0]}:${m[1]}`;
  if (host.endsWith('.smartrecruiters.com') && (m = path.match(/\/[^/]+\/(\d{6,})/))) return `smartrecruiters:${m[1]}`;
  return null;
}

/** Looks for the first ATS link inside description HTML (boards often embed the apply link). */
export function findAtsKeyInHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    const key = extractAtsKey(m[1]!.replace(/&amp;/g, '&'));
    if (key) return key;
  }
  return null;
}
