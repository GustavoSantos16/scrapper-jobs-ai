import { BRAZIL_ELIGIBLE_GEO, type JobsQuery } from '@ajh/shared';
import { sql, type ExpressionBuilder, type SelectQueryBuilder } from 'kysely';
import type { Q } from '../exec.ts';
import type { DB } from '../schema.ts';

/**
 * Turns free text into a safe FTS5 query: every token quoted (no operator injection), the
 * last one as a prefix ("reac" finds "react"). Returns null when nothing searchable remains.
 */
export function toFtsQuery(input: string | undefined): string | null {
  if (!input) return null;
  const tokens = input
    .normalize('NFKC')
    .split(/[\s,;:/|()[\]{}"'`^*+-]+/)
    .map((t) => t.replace(/[^\p{L}\p{N}#.]/gu, '').replace(/\.+$/, ''))
    .filter((t) => t.length > 0)
    .slice(0, 12);
  if (!tokens.length) return null;
  return tokens.map((t, i) => (i === tokens.length - 1 && t.length >= 2 ? `"${t}"*` : `"${t}"`)).join(' ');
}

type Base = SelectQueryBuilder<DB & { t: DB['job_tracking'] }, 'jobs' | 't', object>;

const jsonHasAny = (column: 'technologies' | 'geo_eligibility' | 'contract_types', values: string[], lower = false) =>
  lower
    ? sql<boolean>`EXISTS (SELECT 1 FROM json_each(jobs.${sql.ref(column)}) WHERE lower(value) IN (${sql.join(values.map((v) => v.toLowerCase()))}))`
    : sql<boolean>`EXISTS (SELECT 1 FROM json_each(jobs.${sql.ref(column)}) WHERE value IN (${sql.join(values)}))`;

const like = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Applies every filter of JobsQuery (except paging/sorting). */
export function applyFilters(base: Base, f: JobsQuery, fts: string | null): Base {
  let qb = base;
  if (fts) qb = qb.where(sql<boolean>`jobs.id IN (SELECT rowid FROM jobs_fts WHERE jobs_fts MATCH ${fts})`);
  if (f.title) qb = qb.where(sql<boolean>`jobs.title LIKE ${like(f.title)} ESCAPE '\\'`);
  if (f.company) qb = qb.where(sql<boolean>`jobs.company LIKE ${like(f.company)} ESCAPE '\\'`);
  if (f.city) qb = qb.where(sql<boolean>`(jobs.city LIKE ${like(f.city)} ESCAPE '\\' OR jobs.location_raw LIKE ${like(f.city)} ESCAPE '\\')`);
  if (f.tech?.length) qb = qb.where(jsonHasAny('technologies', f.tech, true));
  if (f.country?.length) qb = qb.where('jobs.country', 'in', f.country.map((c) => c.toUpperCase()));
  if (f.remote?.length) qb = qb.where('jobs.remote_type', 'in', f.remote);
  if (f.contract?.length) qb = qb.where(jsonHasAny('contract_types', f.contract));
  if (f.seniority?.length) qb = qb.where('jobs.seniority', 'in', f.seniority);
  if (f.language?.length) qb = qb.where('jobs.language', 'in', f.language);
  if (f.geo?.length) qb = qb.where(jsonHasAny('geo_eligibility', f.geo));
  if (f.eligibleBrazil) qb = qb.where(jsonHasAny('geo_eligibility', [...BRAZIL_ELIGIBLE_GEO]));
  if (f.international) qb = qb.where(sql<boolean>`(jobs.country IS NULL OR jobs.country != 'BR')`);
  if (f.source?.length) {
    const sources = f.source;
    qb = qb.where((eb) =>
      eb.exists(eb.selectFrom('job_listings as l').select('l.id').whereRef('l.job_id', '=', 'jobs.id').where('l.source', 'in', sources)),
    );
  }
  if (f.hasSalary) qb = qb.where((eb) => eb.or([eb('jobs.salary_min', 'is not', null), eb('jobs.salary_max', 'is not', null)]));
  if (f.salaryCurrency) qb = qb.where('jobs.salary_currency', '=', f.salaryCurrency.toUpperCase());
  // salary range overlap: [min, max] of the job intersects the requested range
  if (f.salaryMin !== undefined) qb = qb.where(sql<boolean>`COALESCE(jobs.salary_max, jobs.salary_min) >= ${f.salaryMin}`);
  if (f.salaryMax !== undefined) qb = qb.where(sql<boolean>`COALESCE(jobs.salary_min, jobs.salary_max) <= ${f.salaryMax}`);
  if (f.publishedUnknown) qb = qb.where('jobs.published_at', 'is', null);
  if (f.publishedFrom) qb = qb.where('jobs.published_at', '>=', f.publishedFrom);
  if (f.publishedTo) qb = qb.where('jobs.published_at', '<', f.publishedTo);
  if (f.seenFrom) qb = qb.where('jobs.first_seen_at', '>=', f.seenFrom);
  if (f.seenTo) qb = qb.where('jobs.first_seen_at', '<', f.seenTo);
  if (f.minScore !== undefined) qb = qb.where('jobs.score', '>=', f.minScore);
  if (f.favorite !== undefined) qb = qb.where(sql<boolean>`COALESCE(t.favorite, 0) = ${f.favorite ? 1 : 0}`);
  if (f.reviewed !== undefined) qb = qb.where(sql<boolean>`COALESCE(t.state, 'new') ${f.reviewed ? sql`!=` : sql`=`} 'new'`);
  if (f.state?.length) qb = qb.where(sql<boolean>`COALESCE(t.state, 'new') IN (${sql.join(f.state)})`);
  if (f.ignored === 'hide') qb = qb.where(sql<boolean>`COALESCE(t.ignored, 0) = 0`);
  if (f.ignored === 'only') qb = qb.where(sql<boolean>`COALESCE(t.ignored, 0) = 1`);
  if (f.status !== 'all') qb = qb.where('jobs.status', '=', f.status);
  return qb;
}

export const SUMMARY_COLUMNS = [
  'jobs.id', 'jobs.title', 'jobs.company', 'jobs.summary', 'jobs.url', 'jobs.country', 'jobs.city', 'jobs.location_raw',
  'jobs.remote_type', 'jobs.geo_eligibility', 'jobs.contract_types', 'jobs.seniority', 'jobs.technologies', 'jobs.language',
  'jobs.salary_min', 'jobs.salary_max', 'jobs.salary_currency', 'jobs.salary_period', 'jobs.published_at', 'jobs.first_seen_at',
  'jobs.last_seen_at', 'jobs.status', 'jobs.score', 'jobs.primary_listing_id',
] as const;

export interface SummaryRow {
  id: number;
  title: string;
  company: string | null;
  summary: string | null;
  url: string;
  country: string | null;
  city: string | null;
  location_raw: string | null;
  remote_type: string;
  geo_eligibility: string;
  contract_types: string;
  seniority: string;
  technologies: string;
  language: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;
  published_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
  status: string;
  score: number;
  primary_listing_id: number | null;
  primary_source: string | null;
  primary_url: string | null;
  source_count: number;
  t_state: string | null;
  t_favorite: number | null;
  t_ignored: number | null;
  t_has_notes: number | null;
}

function baseQuery(q: Q): Base {
  return q.db.selectFrom('jobs').leftJoin('job_tracking as t', 't.job_id', 'jobs.id') as unknown as Base;
}

function withSummaryColumns(qb: Base) {
  return qb.select(SUMMARY_COLUMNS).select((eb: ExpressionBuilder<DB & { t: DB['job_tracking'] }, 'jobs' | 't'>) => [
    eb.selectFrom('job_listings as p').select('p.source').whereRef('p.id', '=', 'jobs.primary_listing_id').as('primary_source'),
    eb.selectFrom('job_listings as p').select('p.url').whereRef('p.id', '=', 'jobs.primary_listing_id').as('primary_url'),
    eb.selectFrom('job_listings as c').select((e) => e.fn.countAll<number>().as('n')).whereRef('c.job_id', '=', 'jobs.id').as('source_count'),
    sql<string | null>`t.state`.as('t_state'),
    sql<number | null>`t.favorite`.as('t_favorite'),
    sql<number | null>`t.ignored`.as('t_ignored'),
    sql<number>`(t.notes IS NOT NULL AND t.notes != '')`.as('t_has_notes'),
  ]);
}

/** Server-side search with filters, sorting and pagination. */
export function searchJobs(
  q: Q,
  f: JobsQuery,
  { limitOverride, onlyIds }: { limitOverride?: number; onlyIds?: number[] } = {},
): { rows: SummaryRow[]; total: number } {
  const fts = toFtsQuery(f.q);
  let filtered = applyFilters(baseQuery(q), f, fts);
  if (onlyIds) filtered = filtered.where('jobs.id', 'in', onlyIds.length ? onlyIds : [-1]);
  const total = q.get(filtered.select((eb) => eb.fn.countAll<number>().as('n')))?.n ?? 0;

  let qb = withSummaryColumns(filtered);
  const dir = f.order ?? (f.sort === 'company' || f.sort === 'title' ? 'asc' : 'desc');
  switch (f.sort) {
    case 'published':
      // unknown dates go last regardless of direction
      qb = qb.orderBy(sql`jobs.published_at IS NULL`).orderBy('jobs.published_at', dir);
      break;
    case 'captured':
      qb = qb.orderBy('jobs.first_seen_at', dir);
      break;
    case 'company':
      qb = qb.orderBy(sql`jobs.company IS NULL`).orderBy(sql`lower(jobs.company)`, dir);
      break;
    case 'title':
      qb = qb.orderBy(sql`lower(jobs.title)`, dir);
      break;
    case 'score':
      qb = qb.orderBy('jobs.score', dir);
      break;
    case 'relevance':
      // text relevance (bm25: lower is better) when searching, then profile score
      if (fts) {
        qb = qb.orderBy(
          sql`(SELECT bm25(jobs_fts, 10.0, 4.0, 1.0, 3.0, 1.0) FROM jobs_fts WHERE jobs_fts MATCH ${fts} AND jobs_fts.rowid = jobs.id)`,
          dir === 'desc' ? 'asc' : 'desc',
        );
      }
      qb = qb.orderBy('jobs.score', dir).orderBy(sql`jobs.published_at IS NULL`).orderBy('jobs.published_at', 'desc');
      break;
  }
  qb = qb.orderBy('jobs.id', 'desc');
  const limit = limitOverride ?? f.pageSize;
  const offset = limitOverride ? 0 : (f.page - 1) * f.pageSize;
  const rows = q.all(qb.limit(limit).offset(offset)) as unknown as SummaryRow[];
  return { rows, total };
}
