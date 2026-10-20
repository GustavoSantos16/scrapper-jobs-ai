import type { SalaryPeriod } from '@ajh/shared';

export interface Salary {
  min: number | null;
  max: number | null;
  currency: string | null;
  period: SalaryPeriod | null;
}

export const NO_SALARY: Salary = { min: null, max: null, currency: null, period: null };

const SYMBOLS: [RegExp, string][] = [
  [/R\$/i, 'BRL'],
  [/US\$|USD|U\$/i, 'USD'],
  [/CA\$|CAD|C\$/i, 'CAD'],
  [/AU\$|AUD|A\$/i, 'AUD'],
  [/€|EUR\b/i, 'EUR'],
  [/£|GBP\b/i, 'GBP'],
  [/CHF\b/i, 'CHF'],
  [/₹|INR\b/i, 'INR'],
  [/MXN\b/i, 'MXN'],
  [/BRL\b|reais\b/i, 'BRL'],
  [/\$/, 'USD'], // bare "$" last: most remote boards quote USD
];

export function normalizeCurrency(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (/^[A-Za-z]{3}$/.test(s)) return s.toUpperCase();
  for (const [re, code] of SYMBOLS) if (re.test(s)) return code;
  return null;
}

export function normalizePeriod(raw: string | null | undefined): SalaryPeriod | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (/\b(year|yearly|annual|annually|annum|yr|ano|anual)\b|\/y\b|\bpa\b/.test(s)) return 'year';
  if (/\b(month|monthly|mo|m[eê]s|mensal)\b|\/m\b/.test(s)) return 'month';
  if (/\b(week|weekly|semana|semanal|wk)\b/.test(s)) return 'week';
  if (/\b(day|daily|dia|di[aá]rio)\b/.test(s)) return 'day';
  if (/\b(hour|hourly|hr|hora|h)\b|\/h\b/.test(s)) return 'hour';
  if (/\b(task|tarefa|project|projeto)\b/.test(s)) return 'task';
  return null;
}

/** Parses "120,000" / "120.000" / "120k" / "8.500,50" into a number. */
export function parseAmount(raw: string): number | null {
  let s = raw.trim().toLowerCase().replace(/\s/g, '');
  let mult = 1;
  if (s.endsWith('k')) {
    mult = 1000;
    s = s.slice(0, -1);
  } else if (s.endsWith('m')) {
    mult = 1_000_000;
    s = s.slice(0, -1);
  }
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // both present: the last one is the decimal separator
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? ',' : '.';
    const groups = s.split(sep);
    const thousands = groups.length > 1 && groups.slice(1).every((g) => g.length === 3);
    if (thousands) {
      s = groups.join('');
    } else if (groups.length === 2) {
      s = `${groups[0]}.${groups[1]}`;
    } else {
      return null;
    }
  }
  const n = Number(s) * mult;
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

const AMOUNT = String.raw`\d[\d.,]*\s?[kKmM]?\b`;

/**
 * Best-effort parse of free-text salaries ("$120k - $150k/year", "R$ 8.000 a 12.000 por mês",
 * "€60,000–€80,000", "$1000 per task"). Returns all-null when nothing reliable is found.
 */
export function parseSalaryText(raw: string | null | undefined, fallbackCurrency: string | null = null): Salary {
  if (!raw) return NO_SALARY;
  const text = raw.replace(/\u00a0/g, ' ');
  const currency = normalizeCurrency(text) ?? fallbackCurrency;
  const nums = [...text.matchAll(new RegExp(AMOUNT, 'g'))]
    .map((m) => parseAmount(m[0]))
    .filter((n): n is number => n !== null);
  if (!nums.length || !currency) return NO_SALARY;
  const [a, b] = nums;
  const min = a ?? null;
  const max = b !== undefined && b >= (a ?? 0) ? b : null;
  let period = normalizePeriod(text);
  if (!period && min !== null) period = min >= 10_000 ? 'year' : null;
  return { min, max: max ?? null, currency, period };
}

/** Builds a salary from structured numeric fields; 0/negative/NaN mean "not provided". */
export function structuredSalary(
  min: unknown,
  max: unknown,
  currency: unknown,
  period: unknown,
): Salary {
  const toNum = (v: unknown) => {
    const n = typeof v === 'string' ? parseAmount(v) : typeof v === 'number' ? v : null;
    return n !== null && Number.isFinite(n) && n > 0 ? n : null;
  };
  const lo = toNum(min);
  const hi = toNum(max);
  if (lo === null && hi === null) return NO_SALARY;
  return {
    min: lo ?? hi,
    max: lo !== null && hi !== null && hi >= lo ? hi : null,
    currency: normalizeCurrency(typeof currency === 'string' ? currency : null),
    period: normalizePeriod(typeof period === 'string' ? period : null),
  };
}
