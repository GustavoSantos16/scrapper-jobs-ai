import { z } from 'zod';
import { buildJob, parseDate } from '../normalize/index.ts';
import type { Connector } from '../types.ts';

const ArbeitnowJob = z.object({
  slug: z.string(),
  company_name: z.string().nullish(),
  title: z.string(),
  description: z.string().nullish(),
  remote: z.boolean(),
  url: z.string(),
  tags: z.array(z.string()).nullish(),
  job_types: z.array(z.string()).nullish(),
  location: z.string().nullish(),
  created_at: z.number().nullish(),
});
type ArbeitnowJob = z.infer<typeof ArbeitnowJob>;
const Response = z.object({ data: z.array(z.unknown()), links: z.object({ next: z.string().nullish() }).nullish() });

const MAX_PAGES = 3;

export const arbeitnow: Connector<ArbeitnowJob> = {
  id: 'arbeitnow',
  name: 'Arbeitnow',
  kind: 'official_api',
  homepageUrl: 'https://www.arbeitnow.com',
  docsUrl: 'https://www.arbeitnow.com/blog/job-board-api',
  attribution: 'Vagas via Arbeitnow (arbeitnow.com)',
  description: 'API pública (foco Europa/Alemanha). Capturamos apenas vagas marcadas como remotas.',
  rateLimit: { minIntervalMinutes: 60, maxRequestsPerRun: MAX_PAGES, minDelayMs: 2000 },
  allowedHosts: ['arbeitnow.com'],
  async *fetchJobs({ http }) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const data = Response.parse(await http.getJson(`https://www.arbeitnow.com/api/job-board-api?page=${page}`));
      for (const raw of data.data) {
        const parsed = ArbeitnowJob.safeParse(raw);
        // capture scope: the profile is remote-only and ~90% of this feed is on-site in Germany
        if (parsed.success && parsed.data.remote) yield parsed.data;
      }
      if (!data.links?.next) break;
    }
  },
  normalize(j, { now }) {
    return buildJob({
      source: 'arbeitnow',
      sourceJobId: j.slug,
      title: j.title,
      url: j.url,
      company: j.company_name,
      descriptionHtml: j.description,
      locations: [j.location],
      remoteType: 'remote',
      contractHints: j.job_types ?? [],
      seniorityHints: j.job_types ?? [],
      tags: j.tags ?? [],
      publishedAt: parseDate(j.created_at, now),
    });
  },
};
