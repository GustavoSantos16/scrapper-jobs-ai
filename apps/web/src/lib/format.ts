import type { SalaryPeriod } from '@ajh/shared';

let displayTimeZone = 'America/Sao_Paulo';
export function setDisplayTimeZone(tz: string): void {
  displayTimeZone = tz;
}
export function getDisplayTimeZone(): string {
  return displayTimeZone;
}

export function formatDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: 'short' }): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: displayTimeZone, ...opts }).format(new Date(iso));
}

export function formatDateTime(iso: string | null | undefined): string {
  return formatDate(iso, { dateStyle: 'short', timeStyle: 'short' });
}

const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
export function formatRelative(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '—';
  const diff = (Date.parse(iso) - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86_400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 30 * 86_400) return rtf.format(Math.round(diff / 86_400), 'day');
  return formatDate(iso);
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  return `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}

const PERIOD: Record<SalaryPeriod, string> = { year: '/ano', month: '/mês', week: '/semana', day: '/dia', hour: '/hora', task: '/tarefa' };

export function formatMoney(n: number, currency: string | null): string {
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: currency ? 'currency' : 'decimal',
      currency: currency ?? undefined,
      notation: n >= 100_000 ? 'compact' : 'standard',
      maximumFractionDigits: n >= 100_000 ? 1 : 0,
    }).format(n);
  } catch {
    return `${currency ?? ''} ${n}`;
  }
}

export function formatSalary(min: number | null, max: number | null, currency: string | null, period: SalaryPeriod | null): string | null {
  if (min === null && max === null) return null;
  const range = min !== null && max !== null && max !== min ? `${formatMoney(min, currency)} – ${formatMoney(max, currency)}` : formatMoney((min ?? max)!, currency);
  return `${range}${period ? ` ${PERIOD[period]}` : ''}`;
}

/** "YYYY-MM-DD" of a date in the display time zone (for date inputs). */
export function localDay(iso: string | Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: displayTimeZone }).format(typeof iso === 'string' ? new Date(iso) : iso);
}

function tzOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: displayTimeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return Math.round((Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** UTC ISO of local midnight in the display time zone, `daysBack` days ago. */
export function startOfDayIso(daysBack = 0, at: Date = new Date()): string {
  const offset = tzOffsetMinutes(at);
  const local = new Date(at.getTime() + offset * 60_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - daysBack) - offset * 60_000).toISOString();
}

/** UTC ISO of local midnight of a "YYYY-MM-DD" day in the display time zone. */
export function dayToIso(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const guess = new Date(Date.UTC(y, m - 1, d));
  return new Date(guess.getTime() - tzOffsetMinutes(guess) * 60_000).toISOString();
}
