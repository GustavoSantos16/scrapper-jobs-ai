import { z } from 'zod';
import { buildJob, parseDate, structuredSalary } from '../normalize/index.ts';
import type { Connector } from '../types.ts';

const RemoteOkJob = z.object({
  id: z.union([z.string(), z.number()]),
  slug: z.string().nullish(),
  epoch: z.number().nullish(),
  date: z.string().nullish(),
  company: z.string().nullish(),
  position: z.string(),
  tags: z.array(z.string()).nullish(),
  description: z.string().nullish(),
  location: z.string().nullish(),
  salary_min: z.number().nullish(),
  salary_max: z.number().nullish(),
  url: z.string(),
  apply_url: z.string().nullish(),
});
type RemoteOkJob = z.infer<typeof RemoteOkJob>;

export const remoteok: Connector<RemoteOkJob> = {
  id: 'remoteok',
  name: 'Remote OK',
  kind: 'official_api',
  homepageUrl: 'https://remoteok.com',
  docsUrl: 'https://remoteok.com/api',
  attribution: 'Vagas via Remote OK (remoteok.com)',
  description: 'API JSON pública da Remote OK. Exige link de volta e citar a Remote OK como fonte.',
  rateLimit: { minIntervalMinutes: 60, maxRequestsPerRun: 1, minDelayMs: 1000 },
  allowedHosts: ['remoteok.com'],
  async *fetchJobs({ http }) {
    const data = await http.getJson<unknown[]>('https://remoteok.com/api');
    if (!Array.isArray(data)) throw new Error('Remote OK: unexpected response shape');
    for (const raw of data) {
      // the first element is the legal notice, not a job
      const parsed = RemoteOkJob.safeParse(raw);
      if (parsed.success) yield parsed.data;
    }
  },
  normalize(j, { now }) {
    const salary = structuredSalary(j.salary_min, j.salary_max, 'USD', 'year');
    return buildJob({
      source: 'remoteok',
      sourceJobId: j.id,
      title: j.position,
      url: j.url.replace('remoteOK.com', 'remoteok.com'),
      company: j.company,
      descriptionHtml: j.description,
      locations: [j.location],
      remoteType: 'remote',
      tags: j.tags ?? [],
      contractHints: j.tags ?? [],
      salaryMin: salary.min,
      salaryMax: salary.max,
      salaryCurrency: salary.currency,
      salaryPeriod: salary.period,
      publishedAt: parseDate(j.date ?? j.epoch, now),
    });
  },
};
