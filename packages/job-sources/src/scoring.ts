import { BRAZIL_ELIGIBLE_GEO, type NormalizedJob, type Profile, type ScoreReason } from '@ajh/shared';
import { fold, textHasTerm } from './normalize/classify.ts';

export type ScoreInput = Pick<
  NormalizedJob,
  | 'title'
  | 'descriptionText'
  | 'technologies'
  | 'remoteType'
  | 'geoEligibility'
  | 'contractTypes'
  | 'seniority'
  | 'publishedAt'
  | 'salaryMin'
  | 'salaryMax'
  | 'salaryCurrency'
>;

export interface ScoreResult {
  score: number;
  breakdown: ScoreReason[];
}

/** f in [-1, 1]: 1 = full match, 0.5 = neutral (information missing), <0 = explicit mismatch. */
interface Component {
  key: keyof Profile['weights'];
  label: string;
  f: number;
  reason: string;
}

const NEUTRAL = 0.5;
const GENERIC_ROLES = new Set(['software engineer', 'desenvolvedor', 'developer', 'engineer', 'full stack', 'fullstack', 'programador']);
const RESTRICTION_LABEL: Record<string, string> = {
  us_only: 'EUA',
  canada_only: 'Canadá',
  uk_only: 'Reino Unido',
  eu_only: 'Europa/UE',
  restricted_other: 'outra região',
};

const list = (xs: string[]) => xs.join(', ');
const PT: Record<string, string> = {
  remote: 'remota', hybrid: 'híbrida', onsite: 'presencial',
  worldwide: 'mundial', americas: 'Américas', latam: 'LATAM', brazil: 'Brasil',
  clt: 'CLT', pj: 'PJ', contractor: 'contractor', full_time: 'tempo integral', part_time: 'meio período',
  freelance: 'freelance', internship: 'estágio', temporary: 'temporário',
  intern: 'estágio', junior: 'júnior', mid: 'pleno', senior: 'sênior', staff: 'staff', lead: 'lead', principal: 'principal',
};
const pt = (xs: string[]) => list(xs.map((x) => PT[x] ?? x));

/**
 * Transparent weighted score (0–100). Each component contributes weight × f; missing
 * information is neutral (f = 0.5), explicit incompatibility is negative. Low scores never
 * remove a job: the score only orders and explains.
 */
export function scoreJob(job: ScoreInput, profile: Profile, now: Date = new Date()): ScoreResult {
  const title = fold(job.title);
  const body = fold([job.title, job.technologies.join(' '), job.descriptionText ?? ''].join('\n'));
  const hasBody = Boolean(job.descriptionText?.trim()) || job.technologies.length > 0;
  const c: Component[] = [];

  // title
  const roleHits = profile.roles.filter((r) => textHasTerm(title, r));
  const specific = roleHits.filter((r) => !GENERIC_ROLES.has(fold(r)));
  c.push(
    specific.length
      ? { key: 'title', label: 'Cargo', f: 1, reason: `Cargo compatível: ${list(specific)}` }
      : roleHits.length
        ? { key: 'title', label: 'Cargo', f: 0.6, reason: `Cargo genérico: ${list(roleHits)}` }
        : { key: 'title', label: 'Cargo', f: 0, reason: 'Cargo fora do perfil' },
  );

  // primary technologies
  const primary = profile.primaryTech.filter((t) => textHasTerm(body, t));
  c.push(
    !hasBody && !primary.length
      ? { key: 'primaryTech', label: 'Tecnologias prioritárias', f: NEUTRAL, reason: 'Sem descrição para avaliar' }
      : primary.length >= 2
        ? { key: 'primaryTech', label: 'Tecnologias prioritárias', f: 1, reason: `Encontradas: ${list(primary)}` }
        : primary.length === 1
          ? { key: 'primaryTech', label: 'Tecnologias prioritárias', f: 0.7, reason: `Encontrada: ${primary[0]}` }
          : { key: 'primaryTech', label: 'Tecnologias prioritárias', f: 0, reason: 'Nenhuma tecnologia prioritária' },
  );

  // complementary technologies
  const comp = profile.complementaryTech.filter((t) => textHasTerm(body, t));
  c.push(
    !hasBody && !comp.length
      ? { key: 'complementaryTech', label: 'Tecnologias complementares', f: NEUTRAL, reason: 'Sem descrição para avaliar' }
      : {
          key: 'complementaryTech',
          label: 'Tecnologias complementares',
          f: Math.min(1, comp.length / 2),
          reason: comp.length ? `Encontradas: ${list(comp)}` : 'Nenhuma tecnologia complementar',
        },
  );

  // remote
  const rt = job.remoteType;
  c.push(
    rt === 'unknown'
      ? { key: 'remote', label: 'Modalidade', f: NEUTRAL, reason: 'Modalidade não informada' }
      : profile.remoteTypes.includes(rt)
        ? { key: 'remote', label: 'Modalidade', f: 1, reason: `Modalidade ${pt([rt])} desejada` }
        : rt === 'onsite'
          ? { key: 'remote', label: 'Modalidade', f: -0.5, reason: 'Vaga presencial' }
          : { key: 'remote', label: 'Modalidade', f: 0, reason: `Modalidade ${pt([rt])} fora da preferência` },
  );

  // geographic eligibility
  const geo = job.geoEligibility;
  const accepted = geo.filter((g) => profile.acceptedGeo.includes(g));
  const restrictions = geo.filter((g) => !BRAZIL_ELIGIBLE_GEO.includes(g));
  c.push(
    accepted.length
      ? { key: 'geo', label: 'Elegibilidade geográfica', f: 1, reason: `Aceita: ${pt(accepted)}` }
      : restrictions.length
        ? {
            key: 'geo',
            label: 'Elegibilidade geográfica',
            f: -1,
            reason: `Restrita a ${list(restrictions.map((r) => RESTRICTION_LABEL[r] ?? r))}`,
          }
        : { key: 'geo', label: 'Elegibilidade geográfica', f: NEUTRAL, reason: 'Elegibilidade não informada' },
  );

  // contract
  const contracts = job.contractTypes.filter((t) => profile.contractTypes.includes(t));
  c.push(
    !job.contractTypes.length
      ? { key: 'contract', label: 'Tipo de contrato', f: NEUTRAL, reason: 'Contrato não informado' }
      : contracts.length
        ? { key: 'contract', label: 'Tipo de contrato', f: 1, reason: `Contrato: ${pt(contracts)}` }
        : { key: 'contract', label: 'Tipo de contrato', f: 0, reason: `Contrato fora da preferência: ${pt(job.contractTypes)}` },
  );

  // seniority
  const s = job.seniority;
  const adjacent =
    (['staff', 'lead', 'principal'].includes(s) && profile.seniorities.includes('senior')) ||
    (s === 'junior' && profile.seniorities.includes('mid'));
  c.push(
    s === 'unknown'
      ? { key: 'seniority', label: 'Senioridade', f: NEUTRAL, reason: 'Senioridade não informada' }
      : profile.seniorities.includes(s)
        ? { key: 'seniority', label: 'Senioridade', f: 1, reason: `Senioridade ${pt([s])}` }
        : s === 'intern'
          ? { key: 'seniority', label: 'Senioridade', f: -0.5, reason: 'Vaga de estágio' }
          : adjacent
            ? { key: 'seniority', label: 'Senioridade', f: NEUTRAL, reason: `Senioridade próxima: ${pt([s])}` }
            : { key: 'seniority', label: 'Senioridade', f: 0, reason: `Senioridade ${pt([s])} fora da preferência` },
  );

  // recency
  if (!job.publishedAt) {
    c.push({ key: 'recency', label: 'Recência', f: NEUTRAL, reason: 'Data de publicação desconhecida' });
  } else {
    const days = (now.getTime() - Date.parse(job.publishedAt)) / 86_400_000;
    const f = days <= 1 ? 1 : days <= 3 ? 0.85 : days <= 7 ? 0.7 : days <= 14 ? 0.5 : days <= 30 ? 0.3 : 0;
    c.push({ key: 'recency', label: 'Recência', f, reason: `Publicada há ${Math.max(0, Math.floor(days))} dia(s)` });
  }

  // salary
  const hasSalary = job.salaryMin !== null || job.salaryMax !== null;
  c.push(
    hasSalary
      ? {
          key: 'salary',
          label: 'Salário informado',
          f: 1,
          reason: `Salário informado${job.salaryCurrency ? ` (${job.salaryCurrency})` : ''}`,
        }
      : { key: 'salary', label: 'Salário informado', f: NEUTRAL, reason: 'Salário não informado' },
  );

  const weights = profile.weights;
  const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const scale = 100 / total;
  const breakdown = c.map((x) => {
    const max = weights[x.key] * scale;
    return { key: x.key, label: x.label, points: round1(max * x.f), max: round1(max), reason: x.reason };
  });
  const raw = c.reduce((sum, x) => sum + weights[x.key] * scale * x.f, 0);
  return { score: Math.max(0, Math.min(100, Math.round(raw))), breakdown };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10 || 0; // avoid -0
}
