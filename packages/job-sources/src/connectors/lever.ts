import { z } from 'zod';
import { buildJob, normalizeCurrency, normalizePeriod, parseDate, remoteTypeFromStructured } from '../normalize/index.ts';
import type { Connector } from '../types.ts';
import { perCompany, type WithCompany } from './ats-common.ts';

const LeverJob = z.object({
  id: z.string(),
  text: z.string(),
  hostedUrl: z.string(),
  createdAt: z.number().nullish(),
  categories: z
    .object({
      commitment: z.string().nullish(),
      location: z.string().nullish(),
      team: z.string().nullish(),
      allLocations: z.array(z.string()).nullish(),
    })
    .nullish(),
  country: z.string().nullish(),
  workplaceType: z.string().nullish(),
  description: z.string().nullish(),
  lists: z.array(z.object({ text: z.string().nullish(), content: z.string().nullish() })).nullish(),
  additional: z.string().nullish(),
  salaryRange: z
    .object({ min: z.number().nullish(), max: z.number().nullish(), currency: z.string().nullish(), interval: z.string().nullish() })
    .nullish(),
});
type LeverJob = z.infer<typeof LeverJob>;

export const lever: Connector<WithCompany<LeverJob>> = {
  id: 'lever',
  name: 'Lever (empresas)',
  kind: 'ats',
  homepageUrl: 'https://www.lever.co',
  docsUrl: 'https://github.com/lever/postings-api',
  attribution: 'Vaga publicada no Lever da empresa',
  description: 'Postings API pública do Lever, consultada por empresa (config/companies.json).',
  rateLimit: { minIntervalMinutes: 60, maxRequestsPerRun: 40, minDelayMs: 1000 },
  allowedHosts: ['api.lever.co'],
  usesCompanies: 'lever',
  fetchJobs(ctx) {
    return perCompany(ctx, 'lever', async (c) => {
      const data = z.array(z.unknown()).parse(await ctx.http.getJson(`https://api.lever.co/v0/postings/${encodeURIComponent(c.slug)}?mode=json`));
      return data.flatMap((j) => {
        const p = LeverJob.safeParse(j);
        return p.success ? [p.data] : [];
      });
    });
  },
  normalize({ company, job: j }, { now }) {
    const html = [
      j.description,
      ...(j.lists ?? []).map((l) => `<h4>${l.text ?? ''}</h4><ul>${l.content ?? ''}</ul>`),
      j.additional,
    ]
      .filter(Boolean)
      .join('\n');
    const s = j.salaryRange;
    const hasSalary = Boolean(s && ((s.min ?? 0) > 0 || (s.max ?? 0) > 0));
    return buildJob({
      source: 'lever',
      sourceJobId: j.id,
      title: j.text,
      url: j.hostedUrl,
      company: company.name,
      descriptionHtml: html,
      locations: j.categories?.allLocations?.length ? j.categories.allLocations : [j.categories?.location],
      country: j.country && /^[A-Z]{2}$/.test(j.country) ? j.country : null,
      remoteType: remoteTypeFromStructured(j.workplaceType),
      contractHints: [j.categories?.commitment],
      ...(hasSalary && {
        salaryMin: s!.min && s!.min > 0 ? s!.min : null,
        salaryMax: s!.max && s!.max > 0 ? s!.max : null,
        salaryCurrency: normalizeCurrency(s!.currency),
        salaryPeriod: normalizePeriod(s!.interval),
      }),
      // createdAt is when the posting was created in Lever (closest to publication)
      publishedAt: parseDate(j.createdAt, now),
    });
  },
};
