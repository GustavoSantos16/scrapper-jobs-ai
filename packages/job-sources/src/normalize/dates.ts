const MIN_VALID = Date.UTC(2000, 0, 1);
const MAX_FUTURE_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * Parses a source date into an ISO-8601 UTC string, or null when unknown/implausible.
 * Accepts epoch seconds or milliseconds, ISO-8601 (an ISO string without offset is read as UTC)
 * and RFC 2822 (RSS). Never substitutes "now": an unknown date stays null.
 */
export function parseDate(input: unknown, now: Date = new Date()): string | null {
  if (input == null || input === '') return null;
  let ms: number;
  if (typeof input === 'number' || (typeof input === 'string' && /^\d{9,13}$/.test(input.trim()))) {
    const n = Number(input);
    if (!Number.isFinite(n) || n <= 0) return null;
    ms = n < 1e12 ? n * 1000 : n;
  } else if (typeof input === 'string') {
    const s = input.trim();
    const isoNoOffset = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?$/.test(s);
    ms = Date.parse(isoNoOffset ? (s.includes('T') ? `${s}Z` : `${s}T00:00:00Z`) : s);
  } else if (input instanceof Date) {
    ms = input.getTime();
  } else {
    return null;
  }
  if (!Number.isFinite(ms)) return null;
  if (ms < MIN_VALID || ms > now.getTime() + MAX_FUTURE_MS) return null;
  return new Date(ms).toISOString();
}
