import { z } from 'zod';
import { buildJob, parseDate, parseSalaryText } from '../normalize/index.ts';
import type { Connector } from '../types.ts';

const RemotiveJob = z.object({
  id: z.number(),
  url: z.string(),
  title: z.string(),
  company_name: z.string().nullish(),
  category: z.string().nullish(),
  tags: z.array(z.string()).nullish(),
  job_type: z.string().nullish(),
  publication_date: z.string().nullish(),
  candidate_required_location: z.string().nullish(),
  salary: z.string().nullish(),
  description: z.string().nullish(),
});
type RemotiveJob = z.infer<typeof RemotiveJob>;
const Response = z.object({ jobs: z.array(z.unknown()) });

/** Each call returns at most 10 jobs; the legal notice asks for ≤ 4 calls/day. */
const QUERIES = ['category=software-dev', 'search=react', 'search=angular', 'search=frontend'];

export const remotive: Connector<RemotiveJob> = {
  id: 'remotive',
  name: 'Remotive',
  kind: 'official_api',
  homepageUrl: 'https://remotive.com',
  docsUrl: 'https://remotive.com/api-documentation',
  attribution: 'Vagas via Remotive (remotive.com)',
  description: 'API pública da Remotive. Dados com 24 h de atraso; no máximo 10 vagas por chamada.',
  rateLimit: { minIntervalMinutes: 720, maxRequestsPerRun: 4, minDelayMs: 3000 },
  allowedHosts: ['remotive.com'],
  async *fetchJobs({ http }) {
    for (const q of QUERIES) {
      const data = Response.parse(await http.getJson(`https://remotive.com/api/remote-jobs?${q}`));
      for (const raw of data.jobs) {
        const parsed = RemotiveJob.safeParse(raw);
        if (parsed.success) yield parsed.data;
      }
    }
  },
  normalize(j, { now }) {
    const salary = parseSalaryText(j.salary);
    return buildJob({
      source: 'remotive',
      sourceJobId: j.id,
      title: j.title,
      url: j.url,
      company: j.company_name,
      descriptionHtml: j.description,
      locations: [j.candidate_required_location],
      remoteType: 'remote',
      contractHints: [j.job_type?.replace(/_/g, ' ')],
      tags: j.tags ?? [],
      salaryMin: salary.min,
      salaryMax: salary.max,
      salaryCurrency: salary.currency,
      salaryPeriod: salary.period,
      publishedAt: parseDate(j.publication_date, now),
    });
  },
};
