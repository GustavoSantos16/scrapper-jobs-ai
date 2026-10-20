import { z } from 'zod';
import { buildJob, parseDate } from '../normalize/index.ts';
import type { Connector } from '../types.ts';

const AdzunaJob = z.object({
  id: z.union([z.string(), z.number()]),
  title: z.string(),
  description: z.string().nullish(),
  redirect_url: z.string(),
  created: z.string().nullish(),
  company: z.object({ display_name: z.string().nullish() }).nullish(),
  location: z.object({ display_name: z.string().nullish(), area: z.array(z.string()).nullish() }).nullish(),
  salary_min: z.number().nullish(),
  salary_max: z.number().nullish(),
  salary_is_predicted: z.union([z.string(), z.number()]).nullish(),
  contract_type: z.string().nullish(),
  contract_time: z.string().nullish(),
});
type AdzunaJob = z.infer<typeof AdzunaJob>;

export const adzuna: Connector<AdzunaJob> = {
  id: 'adzuna',
  name: 'Adzuna',
  kind: 'requires_credential',
  homepageUrl: 'https://www.adzuna.com.br',
  docsUrl: 'https://developer.adzuna.com/overview',
  attribution: 'Vagas via Adzuna (adzuna.com.br)',
  description: 'API oficial com chave gratuita (ADZUNA_APP_ID / ADZUNA_APP_KEY). Busca no Brasil por termos do perfil.',
  rateLimit: { minIntervalMinutes: 360, maxRequestsPerRun: 3, minDelayMs: 2000 },
  allowedHosts: ['api.adzuna.com'],
  requiredEnv: ['ADZUNA_APP_ID', 'ADZUNA_APP_KEY'],
  async *fetchJobs({ http, profile, env }) {
    const auth = `app_id=${encodeURIComponent(env.ADZUNA_APP_ID!)}&app_key=${encodeURIComponent(env.ADZUNA_APP_KEY!)}`;
    for (const term of profile.searchTerms.slice(0, 3)) {
      const data = z
        .object({ results: z.array(z.unknown()) })
        .parse(await http.getJson(`https://api.adzuna.com/v1/api/jobs/br/search/1?${auth}&results_per_page=50&what=${encodeURIComponent(term)}`, { cache: false }));
      for (const raw of data.results) {
        const p = AdzunaJob.safeParse(raw);
        if (p.success) yield p.data;
      }
    }
  },
  normalize(j, { now }) {
    // Adzuna estimates salaries when the ad has none; an estimate is not a published salary
    const predicted = String(j.salary_is_predicted ?? '0') === '1';
    return buildJob({
      source: 'adzuna',
      sourceJobId: j.id,
      title: j.title,
      url: j.redirect_url,
      company: j.company?.display_name,
      descriptionText: j.description ?? null,
      locations: [j.location?.display_name],
      country: 'BR',
      contractHints: [j.contract_type, j.contract_time].map((s) => s?.replace(/_/g, ' ')),
      ...(!predicted && { salaryMin: j.salary_min ?? null, salaryMax: j.salary_max ?? null, salaryCurrency: 'BRL', salaryPeriod: 'year' }),
      publishedAt: parseDate(j.created, now),
    });
  },
};
