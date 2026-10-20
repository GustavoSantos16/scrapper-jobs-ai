import { z } from 'zod';
import { buildJob, detectSeniority, parseDate, remoteTypeFromStructured, structuredSalary } from '../normalize/index.ts';
import type { Connector } from '../types.ts';

const HimalayasJob = z.object({
  guid: z.string(),
  title: z.string(),
  excerpt: z.string().nullish(),
  companyName: z.string().nullish(),
  employmentType: z.string().nullish(),
  minSalary: z.number().nullish(),
  maxSalary: z.number().nullish(),
  currency: z.string().nullish(),
  salaryPeriod: z.string().nullish(),
  seniority: z.array(z.string()).nullish(),
  locationRestrictions: z.array(z.string()).nullish(),
  timezoneRestrictions: z.array(z.number()).nullish(),
  categories: z.array(z.string()).nullish(),
  description: z.string().nullish(),
  pubDate: z.number().nullish(),
  applicationLink: z.string().nullish(),
});
type HimalayasJob = z.infer<typeof HimalayasJob>;
const Response = z.object({ jobs: z.array(z.unknown()) });

export const himalayas: Connector<HimalayasJob> = {
  id: 'himalayas',
  name: 'Himalayas',
  kind: 'official_api',
  homepageUrl: 'https://himalayas.app',
  docsUrl: 'https://himalayas.app/api',
  attribution: 'Vagas via Himalayas (himalayas.app)',
  description: 'API pública de vagas remotas. Usamos a busca por termos do perfil (20 vagas por consulta).',
  rateLimit: { minIntervalMinutes: 360, maxRequestsPerRun: 6, minDelayMs: 2000 },
  allowedHosts: ['himalayas.app'],
  async *fetchJobs({ http, profile }) {
    for (const term of profile.searchTerms.slice(0, 6)) {
      const data = Response.parse(
        await http.getJson(`https://himalayas.app/jobs/api/search?q=${encodeURIComponent(term)}`),
      );
      for (const raw of data.jobs) {
        const parsed = HimalayasJob.safeParse(raw);
        if (parsed.success) yield parsed.data;
      }
    }
  },
  normalize(j, { now }) {
    const salary = structuredSalary(j.minSalary, j.maxSalary, j.currency, j.salaryPeriod);
    const restrictions = j.locationRestrictions ?? [];
    const timezones = j.timezoneRestrictions ?? [];
    // Himalayas docs: open to a country when locationRestrictions is empty (or lists it) and
    // timezoneRestrictions includes its standard UTC offset (Brazil: -3).
    const brazilTimezoneOk = !timezones.length || timezones.includes(-3);
    return buildJob({
      source: 'himalayas',
      sourceJobId: j.guid,
      title: j.title,
      url: j.guid,
      company: j.companyName,
      descriptionHtml: j.description ?? j.excerpt,
      locations: restrictions,
      geoEligibility: restrictions.length ? [] : brazilTimezoneOk ? ['worldwide'] : ['restricted_other'],
      remoteType: remoteTypeFromStructured('remote'),
      contractHints: [j.employmentType],
      seniority: detectSeniority(j.title, ...(j.seniority ?? [])),
      tags: j.categories?.map((c) => c.replace(/-/g, ' ')) ?? [],
      salaryMin: salary.min,
      salaryMax: salary.max,
      salaryCurrency: salary.currency,
      salaryPeriod: salary.period,
      publishedAt: parseDate(j.pubDate, now),
    });
  },
};
