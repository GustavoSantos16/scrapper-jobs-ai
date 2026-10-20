import { describe, expect, it } from 'vitest';
import { parseDate } from '../src/index.ts';

const NOW = new Date('2026-10-20T12:00:00Z');

describe('parseDate', () => {
  it.each([
    ['2026-10-17T16:04:29', '2026-10-17T16:04:29.000Z'], // Remotive: no offset → UTC
    ['2026-10-06T08:59:45-04:00', '2026-10-06T12:59:45.000Z'], // Greenhouse offset
    ['2026-10-20T15:27:06+00:00', '2026-10-20T15:27:06.000Z'],
    ['2026-07-31T18:56:39.246+00:00', '2026-07-31T18:56:39.246Z'],
    ['Mon, 19 Oct 2026 07:31:25 +0000', '2026-10-19T07:31:25.000Z'], // RSS
    ['2026-10-01', '2026-10-01T00:00:00.000Z'],
    [1792522843, '2026-10-20T19:00:43.000Z'], // epoch seconds
    [1790779274622, '2026-09-30T14:41:14.622Z'], // epoch ms
    ['1792522843', '2026-10-20T19:00:43.000Z'],
  ])('parses %s', (input, expected) => {
    expect(parseDate(input, NOW)).toBe(expected);
  });

  it.each([null, undefined, '', 'yesterday', 'Posted 3 days ago', 0, -5, 'not a date', {}, NaN])(
    'returns null for unknown input %s (never substitutes now)',
    (input) => {
      expect(parseDate(input, NOW)).toBeNull();
    },
  );

  it('rejects implausible dates', () => {
    expect(parseDate('1970-01-01T00:00:00Z', NOW)).toBeNull();
    expect(parseDate('2027-06-01T00:00:00Z', NOW)).toBeNull(); // far future
    expect(parseDate('2026-10-21T12:00:00Z', NOW)).toBe('2026-10-21T12:00:00.000Z'); // small clock skew ok
  });
});
