import { z } from 'zod';
import { buildJob, detectSeniority, parseDate, structuredSalary } from '../normalize/index.ts';
import type { Connector } from '../types.ts';

const JobicyJob = z.object({
  id: z.number(),
  url: z.string(),
  jobTitle: z.string(),
  companyName: z.string().nullish(),
  jobIndustry: z.array(z.string()).nullish(),
  jobType: z.array(z.string()).nullish(),
  jobGeo: z.string().nullish(),
  jobLevel: z.string().nullish(),
  jobExcerpt: z.string().nullish(),
  jobDescription: z.string().nullish(),
  pubDate: z.string().nullish(),
  salaryMin: z.union([z.number(), z.string()]).nullish(),
  salaryMax: z.union([z.number(), z.string()]).nullish(),
  salaryCurrency: z.string().nullish(),
  salaryPeriod: z.string().nullish(),
});
type JobicyJob = z.infer<typeof JobicyJob>;
const Response = z.object({ jobs: z.array(z.unknown()) });

const QUERIES = ['industry=engineering', 'tag=react', 'tag=angular'];

export const jobicy: Connector<JobicyJob> = {
  id: 'jobicy',
  name: 'Jobicy',
  kind: 'official_api',
  homepageUrl: 'https://jobicy.com',
  docsUrl: 'https://jobicy.com/jobs-rss-feed',
  attribution: 'Vagas via Jobicy (jobicy.com)',
  description: 'API pública de vagas remotas, com filtros por área e tag.',
  rateLimit: { minIntervalMinutes: 60, maxRequestsPerRun: 3, minDelayMs: 2000 },
  allowedHosts: ['jobicy.com'],
  async *fetchJobs({ http }) {
    for (const q of QUERIES) {
      const data = Response.parse(await http.getJson(`https://jobicy.com/api/v2/remote-jobs?count=100&${q}`));
      for (const raw of data.jobs) {
        const parsed = JobicyJob.safeParse(raw);
        if (parsed.success) yield parsed.data;
      }
    }
  },
  normalize(j, { now }) {
    const salary = structuredSalary(j.salaryMin, j.salaryMax, j.salaryCurrency, j.salaryPeriod);
    return buildJob({
      source: 'jobicy',
      sourceJobId: j.id,
      title: j.jobTitle,
      url: j.url,
      company: j.companyName,
      descriptionHtml: j.jobDescription ?? j.jobExcerpt,
      locations: [j.jobGeo],
      remoteType: 'remote', // Jobicy only lists remote jobs
      contractHints: j.jobType ?? [],
      seniority: detectSeniority(j.jobTitle, j.jobLevel),
      tags: j.jobIndustry ?? [],
      salaryMin: salary.min,
      salaryMax: salary.max,
      salaryCurrency: salary.currency,
      salaryPeriod: salary.period,
      publishedAt: parseDate(j.pubDate, now),
    });
  },
};
