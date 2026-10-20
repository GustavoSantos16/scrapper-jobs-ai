import { z } from 'zod';
import { buildJob, parseSalaryText } from '../normalize/index.ts';
import type { Connector } from '../types.ts';

const JoobleJob = z.object({
  id: z.union([z.string(), z.number()]),
  title: z.string(),
  location: z.string().nullish(),
  snippet: z.string().nullish(),
  salary: z.string().nullish(),
  source: z.string().nullish(),
  type: z.string().nullish(),
  link: z.string(),
  company: z.string().nullish(),
  updated: z.string().nullish(),
});
type JoobleJob = z.infer<typeof JoobleJob>;

export const jooble: Connector<JoobleJob> = {
  id: 'jooble',
  name: 'Jooble',
  kind: 'requires_credential',
  homepageUrl: 'https://br.jooble.org',
  docsUrl: 'https://jooble.org/api/about',
  attribution: 'Vagas via Jooble (jooble.org)',
  description: 'API oficial com chave gratuita (JOOBLE_API_KEY). Busca no Brasil por termos do perfil.',
  rateLimit: { minIntervalMinutes: 360, maxRequestsPerRun: 3, minDelayMs: 2000 },
  allowedHosts: ['jooble.org'],
  requiredEnv: ['JOOBLE_API_KEY'],
  async *fetchJobs({ http, profile, env }) {
    for (const term of profile.searchTerms.slice(0, 3)) {
      const res = await http.request(`https://jooble.org/api/${encodeURIComponent(env.JOOBLE_API_KEY!)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ keywords: `${term} remoto`, location: 'Brasil', page: '1' }),
        cache: false,
      });
      const data = z.object({ jobs: z.array(z.unknown()) }).parse(res.json());
      for (const raw of data.jobs) {
        const p = JoobleJob.safeParse(raw);
        if (p.success) yield p.data;
      }
    }
  },
  normalize(j) {
    const salary = parseSalaryText(j.salary, 'BRL');
    return buildJob({
      source: 'jooble',
      sourceJobId: j.id,
      title: j.title,
      url: j.link,
      company: j.company,
      descriptionHtml: j.snippet,
      locations: [j.location],
      contractHints: [j.type],
      salaryMin: salary.min,
      salaryMax: salary.max,
      salaryCurrency: salary.currency,
      salaryPeriod: salary.period,
      // Jooble only exposes "updated" (last change), which is not a publication date
      publishedAt: null,
    });
  },
};
