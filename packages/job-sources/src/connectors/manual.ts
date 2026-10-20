import type { Profile } from '@ajh/shared';
import type { ManualSource } from '../types.ts';

/** First role/tech terms used to pre-build searches ("React", "Angular", "React Native"). */
function terms(p: Profile): string[] {
  return [...new Set([...p.primaryTech.slice(0, 3), 'Frontend'])].slice(0, 4);
}
const enc = encodeURIComponent;

export const MANUAL_SOURCES: ManualSource[] = [
  {
    id: 'linkedin',
    name: 'LinkedIn',
    kind: 'manual_link',
    homepageUrl: 'https://www.linkedin.com/jobs',
    reason: 'robots.txt bloqueia todos os robôs (Disallow: /) e os termos proíbem scraping; não há API pública de busca de vagas.',
    searchLinks: (p) => [
      ...terms(p).map((t) => ({ label: `${t} · remoto · Brasil`, url: `https://www.linkedin.com/jobs/search/?keywords=${enc(t)}&location=${enc('Brasil')}&f_WT=2` })),
      { label: `${terms(p)[0]} · remoto · mundial`, url: `https://www.linkedin.com/jobs/search/?keywords=${enc(terms(p)[0]!)}&location=${enc('Worldwide')}&f_WT=2` },
    ],
  },
  {
    id: 'glassdoor',
    name: 'Glassdoor',
    kind: 'manual_link',
    homepageUrl: 'https://www.glassdoor.com.br',
    reason: 'API pública de parceiros descontinuada; termos proíbem scraping e o conteúdo exige login.',
    searchLinks: (p) => terms(p).map((t) => ({ label: `${t} remoto`, url: `https://www.glassdoor.com.br/Vaga/index.htm?sc.keyword=${enc(`${t} remoto`)}` })),
  },
  {
    id: 'indeed',
    name: 'Indeed',
    kind: 'manual_link',
    homepageUrl: 'https://br.indeed.com',
    reason: 'A Publisher Jobs API foi descontinuada para novos parceiros; termos proíbem scraping e há proteção anti-bot.',
    searchLinks: (p) => [
      ...terms(p).map((t) => ({ label: `${t} · remoto · Brasil`, url: `https://br.indeed.com/jobs?q=${enc(t)}&l=${enc('Remoto')}` })),
      { label: `${terms(p)[0]} · remote (EUA)`, url: `https://www.indeed.com/jobs?q=${enc(terms(p)[0]!)}&l=Remote` },
    ],
  },
  {
    id: 'wellfound',
    name: 'Wellfound',
    kind: 'manual_link',
    homepageUrl: 'https://wellfound.com',
    reason: 'Sem API pública; a busca exige login e tem proteção anti-bot.',
    searchLinks: () => [
      { label: 'Frontend Engineer · remoto', url: 'https://wellfound.com/role/r/frontend-engineer' },
      { label: 'React Developer · remoto', url: 'https://wellfound.com/role/r/react-developer' },
      { label: 'Mobile Engineer · remoto', url: 'https://wellfound.com/role/r/mobile-engineer' },
    ],
  },
  {
    id: 'google-jobs',
    name: 'Google Jobs',
    kind: 'manual_link',
    homepageUrl: 'https://www.google.com/search?q=vagas&ibp=htl;jobs',
    reason: 'Não existe API pública de busca no Google Jobs (o Cloud Talent Solution indexa apenas vagas próprias).',
    searchLinks: (p) => terms(p).map((t) => ({ label: `vagas ${t} remoto`, url: `https://www.google.com/search?q=${enc(`vagas ${t} remoto`)}&ibp=htl;jobs` })),
  },
  {
    id: 'yc-workatastartup',
    name: 'YC Work at a Startup',
    kind: 'manual_link',
    homepageUrl: 'https://www.workatastartup.com',
    reason: 'Sem feed oficial; a página respondeu HTTP 406 ao cliente automatizado. Parte das vagas YC chega pela fonte "Hacker News Jobs (YC)".',
    searchLinks: () => [{ label: 'Engenharia · remoto', url: 'https://www.workatastartup.com/companies?remote=yes&role=eng' }],
  },
  {
    id: 'workday',
    name: 'Workday (por empresa)',
    kind: 'unavailable',
    homepageUrl: 'https://www.workday.com',
    reason: 'Só há um endpoint interno não documentado por tenant, e a lista traz apenas datas relativas ("Posted Yesterday"), incompatíveis com a regra de datas honestas.',
    searchLinks: () => [],
  },
];
