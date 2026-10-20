import { z } from 'zod';
import { buildJob, normalizeCurrency, normalizePeriod, parseDate, remoteTypeFromStructured } from '../normalize/index.ts';
import type { ContractType } from '@ajh/shared';
import type { Connector } from '../types.ts';
import { perCompany, type WithCompany } from './ats-common.ts';

const AshbyJob = z.object({
  id: z.string(),
  title: z.string(),
  location: z.string().nullish(),
  secondaryLocations: z.array(z.object({ location: z.string().nullish() })).nullish(),
  isRemote: z.boolean().nullish(),
  isListed: z.boolean().nullish(),
  workplaceType: z.string().nullish(),
  employmentType: z.string().nullish(),
  publishedAt: z.string().nullish(),
  jobUrl: z.string(),
  descriptionHtml: z.string().nullish(),
  descriptionPlain: z.string().nullish(),
  compensation: z
    .object({
      summaryComponents: z
        .array(
          z.object({
            compensationType: z.string().nullish(),
            interval: z.string().nullish(),
            currencyCode: z.string().nullish(),
            minValue: z.number().nullish(),
            maxValue: z.number().nullish(),
          }),
        )
        .nullish(),
    })
    .nullish(),
});
type AshbyJob = z.infer<typeof AshbyJob>;

const EMPLOYMENT: Record<string, ContractType> = {
  FullTime: 'full_time',
  PartTime: 'part_time',
  Contract: 'contractor',
  Intern: 'internship',
  Temporary: 'temporary',
};

export const ashby: Connector<WithCompany<AshbyJob>> = {
  id: 'ashby',
  name: 'Ashby (empresas)',
  kind: 'ats',
  homepageUrl: 'https://www.ashbyhq.com',
  docsUrl: 'https://developers.ashbyhq.com/docs/public-job-posting-api',
  attribution: 'Vaga publicada no Ashby da empresa',
  description: 'Posting API pública do Ashby, consultada por empresa (config/companies.json).',
  rateLimit: { minIntervalMinutes: 60, maxRequestsPerRun: 40, minDelayMs: 1000 },
  allowedHosts: ['api.ashbyhq.com'],
  usesCompanies: 'ashby',
  fetchJobs(ctx) {
    return perCompany(ctx, 'ashby', async (c) => {
      const data = z
        .object({ jobs: z.array(z.unknown()) })
        .parse(await ctx.http.getJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(c.slug)}?includeCompensation=true`));
      return data.jobs.flatMap((j) => {
        const p = AshbyJob.safeParse(j);
        return p.success && p.data.isListed !== false ? [p.data] : [];
      });
    });
  },
  normalize({ company, job: j }, { now }) {
    const salary = j.compensation?.summaryComponents?.find((c) => c.compensationType === 'Salary' && (c.minValue || c.maxValue));
    const contract = j.employmentType ? EMPLOYMENT[j.employmentType] : undefined;
    return buildJob({
      source: 'ashby',
      sourceJobId: j.id,
      title: j.title,
      url: j.jobUrl,
      company: company.name,
      descriptionHtml: j.descriptionHtml,
      descriptionText: j.descriptionPlain ?? null,
      locations: [j.location, ...(j.secondaryLocations ?? []).map((l) => l.location)],
      remoteType: j.isRemote ? 'remote' : remoteTypeFromStructured(j.workplaceType),
      ...(contract && { contractTypes: [contract] }),
      ...(salary && {
        salaryMin: salary.minValue ?? null,
        salaryMax: salary.maxValue ?? null,
        salaryCurrency: normalizeCurrency(salary.currencyCode),
        salaryPeriod: normalizePeriod(salary.interval?.replace(/^1\s+/, '')),
      }),
      publishedAt: parseDate(j.publishedAt, now),
    });
  },
};
