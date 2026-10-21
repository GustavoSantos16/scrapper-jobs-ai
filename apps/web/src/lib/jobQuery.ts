import type { JobsQueryInput } from '@ajh/shared';
import { dayToIso, startOfDayIso } from './format.ts';

/** URL params that are UI-only (converted before reaching the API). */
export const PERIODS = [
  { value: '', label: 'Qualquer data' },
  { value: 'today', label: 'Hoje' },
  { value: '24h', label: 'Últimas 24 h' },
  { value: '3d', label: 'Últimos 3 dias' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: 'custom', label: 'Período personalizado' },
] as const;

export function periodRange(period: string, from?: string | null, to?: string | null): { publishedFrom?: string; publishedTo?: string } {
  const now = Date.now();
  switch (period) {
    case 'today':
      return { publishedFrom: startOfDayIso(0) };
    case '24h':
      return { publishedFrom: new Date(now - 86_400_000).toISOString() };
    case '3d':
      return { publishedFrom: startOfDayIso(2) };
    case '7d':
      return { publishedFrom: startOfDayIso(6) };
    case '30d':
      return { publishedFrom: startOfDayIso(29) };
    case 'custom': {
      const out: { publishedFrom?: string; publishedTo?: string } = {};
      if (from) out.publishedFrom = dayToIso(from);
      if (to) {
        const end = new Date(dayToIso(to));
        end.setUTCDate(end.getUTCDate() + 1); // inclusive end day
        out.publishedTo = end.toISOString();
      }
      return out;
    }
    default:
      return {};
  }
}

const UI_ONLY = new Set(['period', 'from', 'to', 'aba']);

/** URLSearchParams → API query (period presets become publishedFrom/To). */
export function paramsToQuery(params: URLSearchParams, fixed: JobsQueryInput = {}): JobsQueryInput {
  const q: Record<string, string> = {};
  for (const [k, v] of params) if (!UI_ONLY.has(k) && v !== '') q[k] = v;
  return { ...q, ...periodRange(params.get('period') ?? '', params.get('from'), params.get('to')), ...fixed } as JobsQueryInput;
}

export const QUICK_SEARCHES: { label: string; params: Record<string, string> }[] = [
  { label: 'React remoto', params: { tech: 'React', remote: 'remote', eligibleBrazil: 'true' } },
  { label: 'Angular Brasil', params: { tech: 'Angular', geo: 'brazil' } },
  { label: 'React Native internacional', params: { tech: 'React Native', international: 'true', eligibleBrazil: 'true' } },
  { label: 'Frontend remoto USD', params: { q: 'frontend', remote: 'remote', salaryCurrency: 'USD' } },
  { label: 'Hoje', params: { period: 'today', sort: 'published' } },
  { label: 'Não revisadas', params: { reviewed: 'false' } },
];
