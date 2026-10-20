import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';
import { buildJob, parseDate } from '../normalize/index.ts';
import type { Connector } from '../types.ts';

const FEEDS = [
  'https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss',
  'https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss',
  'https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss',
];

const text = z.union([z.string(), z.number()]).transform(String).nullish();
const WwrItem = z.object({
  title: z.string(),
  region: text,
  country: text,
  state: text,
  skills: text,
  category: text,
  type: text,
  description: text,
  pubDate: text,
  guid: z.union([z.string(), z.object({ '#text': z.string() })]).nullish(),
  link: z.string(),
});
type WwrItem = z.infer<typeof WwrItem>;

const parser = new XMLParser({ ignoreAttributes: true, processEntities: true, htmlEntities: true, trimValues: true });

export function parseWwrFeed(xml: string): WwrItem[] {
  const doc = parser.parse(xml) as { rss?: { channel?: { item?: unknown } } };
  const items = doc.rss?.channel?.item;
  if (items === undefined) {
    if (!doc.rss?.channel) throw new Error('We Work Remotely: not an RSS feed');
    return [];
  }
  return (Array.isArray(items) ? items : [items]).flatMap((i) => {
    const parsed = WwrItem.safeParse(i);
    return parsed.success ? [parsed.data] : [];
  });
}

export const weworkremotely: Connector<WwrItem> = {
  id: 'weworkremotely',
  name: 'We Work Remotely',
  kind: 'public_feed',
  homepageUrl: 'https://weworkremotely.com',
  docsUrl: 'https://weworkremotely.com/remote-job-rss-feed',
  attribution: 'Vagas via We Work Remotely (weworkremotely.com)',
  description: 'Feeds RSS públicos por categoria (front-end, full-stack, back-end).',
  rateLimit: { minIntervalMinutes: 60, maxRequestsPerRun: FEEDS.length + 1, minDelayMs: 2000 },
  allowedHosts: ['weworkremotely.com'],
  respectRobots: true,
  async *fetchJobs({ http }) {
    for (const feed of FEEDS) {
      yield* parseWwrFeed(await http.getText(feed, { headers: { accept: 'application/rss+xml, application/xml' } }));
    }
  },
  normalize(item, { now }) {
    // titles are "Company: Role"
    const sep = item.title.indexOf(': ');
    const company = sep > 0 ? item.title.slice(0, sep) : null;
    const title = sep > 0 ? item.title.slice(sep + 2) : item.title;
    const id = new URL(item.link).pathname.split('/').filter(Boolean).pop() ?? item.link;
    return buildJob({
      source: 'weworkremotely',
      sourceJobId: id,
      title,
      url: item.link,
      company,
      descriptionHtml: item.description,
      locations: [item.region, item.country],
      remoteType: 'remote',
      contractHints: [item.type],
      tags: item.skills?.split(',').map((s) => s.trim()) ?? [],
      publishedAt: parseDate(item.pubDate, now),
    });
  },
};
