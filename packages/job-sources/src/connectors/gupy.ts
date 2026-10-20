import type { ContractType } from '@ajh/shared';
import { z } from 'zod';
import { buildJob, parseDate, remoteTypeFromStructured } from '../normalize/index.ts';
import type { Connector } from '../types.ts';

const GupyJob = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullish(),
  careerPageName: z.string().nullish(),
  publishedDate: z.string().nullish(),
  workplaceType: z.string().nullish(),
  city: z.string().nullish(),
  state: z.string().nullish(),
  jobUrl: z.string(),
  type: z.string().nullish(),
});
type GupyJob = z.infer<typeof GupyJob>;

const NextData = z.object({
  props: z.object({
    pageProps: z.object({
      initialJobList: z.object({ data: z.array(z.unknown()), pagination: z.object({ total: z.number() }).passthrough().nullish() }),
    }),
  }),
});

const GUPY_TYPES: Record<string, ContractType> = {
  vacancy_type_effective: 'clt',
  vacancy_legal_entity: 'pj',
  vacancy_type_legal_entity: 'pj',
  vacancy_type_internship: 'internship',
  vacancy_type_temporary: 'temporary',
  vacancy_type_freelancer: 'freelance',
  vacancy_type_autonomous: 'freelance',
};

/**
 * Extracts the job list embedded in the portal's server-rendered page. Throws when the page
 * no longer has the expected structure (so a format change fails loudly instead of storing junk).
 */
export function parseGupyPage(html: string): GupyJob[] {
  const m = html.match(/<script[^>]*\bid="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('Gupy: __NEXT_DATA__ not found (page structure changed?)');
  const data = NextData.safeParse(JSON.parse(m[1]!));
  if (!data.success) throw new Error('Gupy: unexpected __NEXT_DATA__ shape (page structure changed?)');
  return data.data.props.pageProps.initialJobList.data.flatMap((j) => {
    const p = GupyJob.safeParse(j);
    return p.success ? [p.data] : [];
  });
}

export const gupy: Connector<GupyJob> = {
  id: 'gupy',
  name: 'Gupy',
  kind: 'public_page',
  homepageUrl: 'https://portal.gupy.io',
  docsUrl: 'https://portal.gupy.io',
  attribution: 'Vaga publicada no portal Gupy (portal.gupy.io)',
  description: 'Página pública de busca do portal Gupy (sem API pública). Estrutura interna: pode quebrar sem aviso.',
  rateLimit: { minIntervalMinutes: 360, maxRequestsPerRun: 5, minDelayMs: 2000 },
  allowedHosts: ['portal.gupy.io'],
  respectRobots: true,
  async *fetchJobs({ http, profile }) {
    for (const term of profile.searchTerms.slice(0, 4)) {
      const html = await http.getText(`https://portal.gupy.io/job-search/term=${encodeURIComponent(term)}&workplaceTypes[]=remote`, {
        headers: { accept: 'text/html' },
        maxBytes: 5 * 1024 * 1024,
      });
      yield* parseGupyPage(html);
    }
  },
  normalize(j, { now }) {
    const contract = j.type ? GUPY_TYPES[j.type] : undefined;
    return buildJob({
      source: 'gupy',
      sourceJobId: j.id,
      title: j.name,
      url: j.jobUrl,
      company: j.careerPageName,
      descriptionText: j.description ?? null,
      locations: [[j.city, j.state].filter(Boolean).join(', ') || null],
      country: 'BR',
      city: j.city ?? null,
      region: j.state ?? null,
      remoteType: remoteTypeFromStructured(j.workplaceType),
      ...(contract && { contractTypes: [contract] }),
      language: 'pt',
      geoEligibility: ['brazil'],
      publishedAt: parseDate(j.publishedDate, now),
    });
  },
};
