import { z } from 'zod';
import { buildJob, parseDate } from '../normalize/index.ts';
import type { Connector } from '../types.ts';
import { perCompany, type WithCompany } from './ats-common.ts';

const GhJob = z.object({
  id: z.number(),
  title: z.string(),
  absolute_url: z.string(),
  company_name: z.string().nullish(),
  location: z.object({ name: z.string().nullish() }).nullish(),
  first_published: z.string().nullish(),
  updated_at: z.string().nullish(),
  language: z.string().nullish(),
  content: z.string().nullish(),
  metadata: z.array(z.object({ name: z.string().nullish(), value: z.unknown() })).nullish(),
  offices: z.array(z.object({ name: z.string().nullish() })).nullish(),
});
type GhJob = z.infer<typeof GhJob>;

const metaText = (j: GhJob) =>
  (j.metadata ?? []).map((m) => (typeof m.value === 'string' ? m.value : Array.isArray(m.value) ? m.value.join(' ') : '')).filter(Boolean);

export const greenhouse: Connector<WithCompany<GhJob>> = {
  id: 'greenhouse',
  name: 'Greenhouse (empresas)',
  kind: 'ats',
  homepageUrl: 'https://www.greenhouse.com',
  docsUrl: 'https://developers.greenhouse.io/job-board.html',
  attribution: 'Vaga publicada no Greenhouse da empresa',
  description: 'Job Board API pública do Greenhouse, consultada por empresa (config/companies.json).',
  rateLimit: { minIntervalMinutes: 60, maxRequestsPerRun: 40, minDelayMs: 1000 },
  allowedHosts: ['boards-api.greenhouse.io'],
  usesCompanies: 'greenhouse',
  fetchJobs(ctx) {
    return perCompany(ctx, 'greenhouse', async (c) => {
      const data = z
        .object({ jobs: z.array(z.unknown()) })
        .parse(await ctx.http.getJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(c.slug)}/jobs?content=true`));
      return data.jobs.flatMap((j) => {
        const p = GhJob.safeParse(j);
        return p.success ? [p.data] : [];
      });
    });
  },
  normalize({ company, job: j }, { now }) {
    const meta = metaText(j);
    return buildJob({
      source: 'greenhouse',
      sourceJobId: j.id,
      title: j.title,
      url: j.absolute_url,
      company: j.company_name ?? company.name,
      descriptionHtml: j.content,
      descriptionEscaped: true, // Greenhouse returns entity-escaped HTML
      locations: [j.location?.name, ...(j.offices ?? []).map((o) => o.name)],
      contractHints: meta,
      seniorityHints: meta,
      language: j.language ?? null,
      // first_published is the publication date; updated_at is not
      publishedAt: parseDate(j.first_published, now),
    });
  },
};
