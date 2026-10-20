/** Offset of `timeZone` from UTC at `at`, in minutes (America/Sao_Paulo → -180). */
export function tzOffsetMinutes(timeZone: string, at: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** UTC instant of local midnight (in `timeZone`) of the day containing `at`, minus `daysBack` days. */
export function startOfDay(timeZone: string, at: Date = new Date(), daysBack = 0): Date {
  const offset = tzOffsetMinutes(timeZone, at);
  const local = new Date(at.getTime() + offset * 60_000);
  const midnightLocalAsUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - daysBack);
  return new Date(midnightLocalAsUtc - offset * 60_000);
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
