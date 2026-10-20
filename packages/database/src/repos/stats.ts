import { sql } from 'kysely';
import type { Q } from '../exec.ts';

export interface DashboardRanges {
  /** Start of "today" in the display time zone, as UTC ISO. */
  todayStart: string;
  /** now - 24h, UTC ISO. */
  last24h: string;
  /** Start of the first day shown in the per-day chart, UTC ISO. */
  chartFrom: string;
  /** Display time zone offset string for SQLite day bucketing, e.g. "-03:00" → "-180 minutes". */
  tzOffsetMinutes: number;
}

const count = (q: Q, where: ReturnType<typeof sql<boolean>>) =>
  (q.sqlite.prepare(`SELECT COUNT(*) AS n FROM jobs LEFT JOIN job_tracking t ON t.job_id = jobs.id WHERE ${where.compile(q.db).sql}`).get(
    ...where.compile(q.db).parameters,
  ) as { n: number }).n;

export function dashboardStats(q: Q, r: DashboardRanges) {
  const active = sql<boolean>`jobs.status = 'active' AND COALESCE(t.ignored, 0) = 0`;
  const kpis = {
    total: count(q, sql<boolean>`1 = 1`),
    active: count(q, active),
    newToday: count(q, sql<boolean>`jobs.first_seen_at >= ${r.todayStart}`),
    publishedLast24h: count(q, sql<boolean>`jobs.published_at >= ${r.last24h}`),
    remote: count(q, sql<boolean>`${active} AND jobs.remote_type = 'remote'`),
    international: count(q, sql<boolean>`${active} AND (jobs.country IS NULL OR jobs.country != 'BR')`),
    eligibleBrazil: count(
      q,
      sql<boolean>`${active} AND EXISTS (SELECT 1 FROM json_each(jobs.geo_eligibility) WHERE value IN ('worldwide','americas','latam','brazil'))`,
    ),
    favorites: count(q, sql<boolean>`COALESCE(t.favorite, 0) = 1`),
    unreviewed: count(q, sql<boolean>`${active} AND COALESCE(t.state, 'new') = 'new'`),
    applications: count(q, sql<boolean>`t.state IN ('applied', 'interview', 'offer')`),
    possiblyClosed: count(q, sql<boolean>`jobs.status = 'possibly_closed'`),
    pendingReviews: q.get(q.db.selectFrom('dedup_reviews').select((eb) => eb.fn.countAll<number>().as('n')).where('status', '=', 'pending'))!.n,
  };

  const shift = `${r.tzOffsetMinutes >= 0 ? '+' : ''}${r.tzOffsetMinutes} minutes`;
  const perDay = (column: 'published_at' | 'first_seen_at') =>
    q.sqlite
      .prepare(
        `SELECT date(${column}, ?) AS day, COUNT(*) AS n FROM jobs WHERE ${column} >= ? GROUP BY day ORDER BY day`,
      )
      .all(shift, r.chartFrom) as { day: string; n: number }[];

  const group = (expr: string, limit = 12, where = "jobs.status = 'active'") =>
    q.sqlite.prepare(`SELECT ${expr} AS key, COUNT(*) AS n FROM jobs WHERE ${where} GROUP BY key ORDER BY n DESC LIMIT ${limit}`).all() as {
      key: string | null;
      n: number;
    }[];

  return {
    kpis,
    publishedPerDay: perDay('published_at'),
    capturedPerDay: perDay('first_seen_at'),
    bySource: q.sqlite
      .prepare("SELECT source AS key, COUNT(*) AS n FROM job_listings WHERE status = 'active' GROUP BY source ORDER BY n DESC")
      .all() as { key: string; n: number }[],
    byCountry: group("COALESCE(country, '??')"),
    byRemote: group('remote_type', 10),
    bySeniority: group('seniority', 10),
    byTech: q.sqlite
      .prepare(
        "SELECT value AS key, COUNT(*) AS n FROM jobs, json_each(jobs.technologies) WHERE jobs.status = 'active' GROUP BY value ORDER BY n DESC LIMIT 15",
      )
      .all() as { key: string; n: number }[],
  };
}

export function facets(q: Q) {
  const all = (s: string) => q.sqlite.prepare(s).all() as { key: string; n: number }[];
  return {
    technologies: all("SELECT value AS key, COUNT(*) AS n FROM jobs, json_each(jobs.technologies) GROUP BY value ORDER BY n DESC LIMIT 60"),
    countries: all('SELECT country AS key, COUNT(*) AS n FROM jobs WHERE country IS NOT NULL GROUP BY country ORDER BY n DESC'),
    sources: all('SELECT source AS key, COUNT(*) AS n FROM job_listings GROUP BY source ORDER BY n DESC'),
    languages: all('SELECT language AS key, COUNT(*) AS n FROM jobs WHERE language IS NOT NULL GROUP BY language ORDER BY n DESC'),
    currencies: all('SELECT salary_currency AS key, COUNT(*) AS n FROM jobs WHERE salary_currency IS NOT NULL GROUP BY salary_currency ORDER BY n DESC'),
  };
}
