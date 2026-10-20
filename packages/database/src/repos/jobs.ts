import type { GeoTag, MatchMethod, NormalizedJob, ScoreReason } from '@ajh/shared';
import { sql } from 'kysely';
import type { Q } from '../exec.ts';
import type { JobsTable } from '../schema.ts';

/** A normalized job plus the derived values the pipeline computed for it. */
export interface JobWrite extends NormalizedJob {
  identityHash: string | null;
  companyNormalized: string | null;
  contentHash: string;
  /** Raw source payload (JSON), for offline reprocessing. */
  raw: string | null;
  score: number;
  scoreBreakdown: ScoreReason[];
}

export interface ListingRef {
  id: number;
  job_id: number;
  content_hash: string | null;
  is_primary: number;
}

export interface CandidateRow {
  jobId: number;
  sources: string[];
  canonicalUrls: string[];
  atsKeys: string[];
  identityHash: string | null;
  companyNormalized: string | null;
  title: string;
  descriptionText: string | null;
}

const json = (v: unknown) => JSON.stringify(v ?? []);

function jobColumns(w: JobWrite) {
  return {
    title: w.title,
    company: w.company,
    company_normalized: w.companyNormalized,
    description_html: w.descriptionHtml,
    description_text: w.descriptionText,
    summary: w.summary,
    url: w.url,
    canonical_url: w.canonicalUrl,
    country: w.country,
    region: w.region,
    city: w.city,
    location_raw: w.locationRaw,
    remote_type: w.remoteType,
    geo_eligibility: json(w.geoEligibility),
    contract_types: json(w.contractTypes),
    seniority: w.seniority,
    technologies: json(w.technologies),
    language: w.language,
    salary_min: w.salaryMin,
    salary_max: w.salaryMax,
    salary_currency: w.salaryCurrency,
    salary_period: w.salaryPeriod,
    identity_hash: w.identityHash,
    published_at: w.publishedAt,
    score: w.score,
    score_breakdown: json(w.scoreBreakdown),
  } satisfies Partial<Record<keyof JobsTable, unknown>>;
}

function listingColumns(w: JobWrite) {
  return {
    source: w.source,
    source_job_id: w.sourceJobId,
    url: w.url,
    canonical_url: w.canonicalUrl,
    ats_key: w.atsKey,
    title: w.title,
    company: w.company,
    published_at: w.publishedAt,
    content_hash: w.contentHash,
    raw: w.raw,
  };
}

/** Layer 1: exact source + original id. */
export function findListing(q: Q, source: string, sourceJobId: string): ListingRef | undefined {
  return q.get(
    q.db
      .selectFrom('job_listings as l')
      .innerJoin('jobs as j', 'j.id', 'l.job_id')
      .select(['l.id', 'l.job_id', 'l.content_hash', sql<number>`(j.primary_listing_id = l.id)`.as('is_primary')])
      .where('l.source', '=', source)
      .where('l.source_job_id', '=', sourceJobId),
  );
}

/** Jobs that could be the same posting: same canonical URL, ATS id, identity hash or company. */
export function findCandidates(
  q: Q,
  w: Pick<JobWrite, 'canonicalUrl' | 'atsKey' | 'identityHash' | 'companyNormalized'>,
): CandidateRow[] {
  const ids = new Set<number>();
  if (w.canonicalUrl) {
    for (const r of q.all(q.db.selectFrom('job_listings').select('job_id').where('canonical_url', '=', w.canonicalUrl))) ids.add(r.job_id);
    for (const r of q.all(q.db.selectFrom('jobs').select('id').where('canonical_url', '=', w.canonicalUrl))) ids.add(r.id);
  }
  if (w.atsKey) {
    for (const r of q.all(q.db.selectFrom('job_listings').select('job_id').where('ats_key', '=', w.atsKey))) ids.add(r.job_id);
  }
  if (w.identityHash) {
    for (const r of q.all(q.db.selectFrom('jobs').select('id').where('identity_hash', '=', w.identityHash))) ids.add(r.id);
  }
  if (w.companyNormalized) {
    const rows = q.all(
      q.db
        .selectFrom('jobs')
        .select('id')
        .where('company_normalized', '=', w.companyNormalized)
        .orderBy('last_seen_at', 'desc')
        .limit(200),
    );
    for (const r of rows) ids.add(r.id);
  }
  if (!ids.size) return [];
  const idList = [...ids];
  const jobs = q.all(
    q.db
      .selectFrom('jobs')
      .select(['id', 'identity_hash', 'company_normalized', 'title', 'description_text'])
      .where('id', 'in', idList),
  );
  const listings = q.all(
    q.db.selectFrom('job_listings').select(['job_id', 'source', 'canonical_url', 'ats_key']).where('job_id', 'in', idList),
  );
  return jobs.map((j) => {
    const ls = listings.filter((l) => l.job_id === j.id);
    return {
      jobId: j.id,
      sources: [...new Set(ls.map((l) => l.source))],
      canonicalUrls: ls.map((l) => l.canonical_url).filter((u): u is string => Boolean(u)),
      atsKeys: ls.map((l) => l.ats_key).filter((k): k is string => Boolean(k)),
      identityHash: j.identity_hash,
      companyNormalized: j.company_normalized,
      title: j.title,
      descriptionText: j.description_text,
    };
  });
}

export function insertJob(q: Q, w: JobWrite, now: string): { jobId: number; listingId: number } {
  const job = q.get(
    q.db
      .insertInto('jobs')
      .values({ ...jobColumns(w), first_seen_at: now, last_seen_at: now, updated_at: now, status: 'active' })
      .returning('id'),
  )!;
  const listing = q.get(
    q.db
      .insertInto('job_listings')
      .values({ ...listingColumns(w), job_id: job.id, first_seen_at: now, last_seen_at: now, match_method: 'primary', match_confidence: 1 })
      .returning('id'),
  )!;
  q.run(q.db.updateTable('jobs').set({ primary_listing_id: listing.id }).where('id', '=', job.id));
  return { jobId: job.id, listingId: listing.id };
}

/** Attaches a listing from another source to an existing job and fills the job's gaps. */
export function addListing(q: Q, jobId: number, w: JobWrite, method: MatchMethod, confidence: number, now: string): number {
  const listing = q.get(
    q.db
      .insertInto('job_listings')
      .values({ ...listingColumns(w), job_id: jobId, first_seen_at: now, last_seen_at: now, match_method: method, match_confidence: confidence })
      .returning('id'),
  )!;
  fillJobGaps(q, jobId, w, now);
  return listing.id;
}

/**
 * Keeps the primary listing's data but fills fields it does not know (publication date,
 * salary, location, description) from another source, and unions technologies/eligibility.
 */
function fillJobGaps(q: Q, jobId: number, w: JobWrite, now: string, sighting = true): void {
  const j = q.get(q.db.selectFrom('jobs').selectAll().where('id', '=', jobId));
  if (!j) return;
  const techs = [...new Set([...(JSON.parse(j.technologies) as string[]), ...w.technologies])];
  const geo = [...new Set([...(JSON.parse(j.geo_eligibility) as GeoTag[]), ...w.geoEligibility])];
  const contracts = [...new Set([...(JSON.parse(j.contract_types) as string[]), ...w.contractTypes])];
  const noSalary = j.salary_min === null && j.salary_max === null;
  q.run(
    q.db
      .updateTable('jobs')
      .set({
        published_at: j.published_at ?? w.publishedAt,
        description_html: j.description_html ?? w.descriptionHtml,
        description_text: j.description_text ?? w.descriptionText,
        summary: j.summary ?? w.summary,
        company: j.company ?? w.company,
        company_normalized: j.company_normalized ?? w.companyNormalized,
        country: j.country ?? w.country,
        location_raw: j.location_raw ?? w.locationRaw,
        remote_type: j.remote_type === 'unknown' ? w.remoteType : j.remote_type,
        seniority: j.seniority === 'unknown' ? w.seniority : j.seniority,
        language: j.language ?? w.language,
        technologies: JSON.stringify(techs),
        geo_eligibility: JSON.stringify(geo),
        contract_types: JSON.stringify(contracts),
        ...(noSalary && {
          salary_min: w.salaryMin,
          salary_max: w.salaryMax,
          salary_currency: w.salaryCurrency,
          salary_period: w.salaryPeriod,
        }),
        ...(sighting && { last_seen_at: sql<string>`MAX(last_seen_at, ${now})`, status: 'active' }),
        updated_at: now,
      })
      .where('id', '=', jobId),
  );
}

/**
 * A listing seen again (or, with `sighting: false`, re-normalized offline). Returns whether
 * its content changed. Only a sighting resets missed runs and reactivates the listing.
 */
export function refreshListing(q: Q, ref: ListingRef, w: JobWrite, now: string, { sighting = true } = {}): 'updated' | 'unchanged' {
  const changed = ref.content_hash !== w.contentHash;
  const seen = sighting
    ? { last_seen_at: sql<string>`MAX(last_seen_at, ${now})`, missed_runs: 0, status: 'active' }
    : {};
  const jobSeen = sighting ? { last_seen_at: sql<string>`MAX(last_seen_at, ${now})`, status: 'active' } : {};
  q.run(
    q.db
      .updateTable('job_listings')
      .set({
        ...seen,
        raw: w.raw,
        ...(changed && { ...listingColumns(w) }),
        // a date learned later is kept; a date never disappears once known
        published_at: sql<string | null>`COALESCE(${w.publishedAt}, published_at)`,
      })
      .where('id', '=', ref.id),
  );
  if (changed && ref.is_primary) {
    q.run(
      q.db
        .updateTable('jobs')
        .set({ ...jobColumns(w), published_at: sql<string | null>`COALESCE(${w.publishedAt}, published_at)`, ...jobSeen, updated_at: now })
        .where('id', '=', ref.job_id),
    );
  } else if (changed) {
    fillJobGaps(q, ref.job_id, w, now, sighting);
  } else if (sighting) {
    q.run(q.db.updateTable('jobs').set(jobSeen).where('id', '=', ref.job_id));
  }
  return changed ? 'updated' : 'unchanged';
}

export function addDedupReview(q: Q, jobId: number, candidateJobId: number, confidence: number, method: string, now: string): void {
  const [a, b] = jobId < candidateJobId ? [jobId, candidateJobId] : [candidateJobId, jobId];
  q.run(
    q.db
      .insertInto('dedup_reviews')
      .values({ job_id: a, candidate_job_id: b, confidence, method, created_at: now })
      .onConflict((oc) => oc.columns(['job_id', 'candidate_job_id']).doNothing()),
  );
}

/**
 * After a successful run of `source`: listings not seen this run get missed_runs + 1; at
 * `threshold` they become possibly_closed, and a job becomes possibly_closed once none of its
 * listings is active. Nothing is deleted.
 */
export function markUnseen(q: Q, source: string, seenListingIds: number[], threshold: number, now: string): { missed: number; closedJobs: number } {
  return q.tx(() => {
    const seen = JSON.stringify(seenListingIds);
    const missed = q.run(
      q.db
        .updateTable('job_listings')
        .set({ missed_runs: sql<number>`missed_runs + 1` })
        .where('source', '=', source)
        .where('status', '=', 'active')
        .where('id', 'not in', sql<number>`(SELECT value FROM json_each(${seen}))`),
    ).changes;
    q.run(
      q.db
        .updateTable('job_listings')
        .set({ status: 'possibly_closed' })
        .where('source', '=', source)
        .where('status', '=', 'active')
        .where('missed_runs', '>=', threshold),
    );
    const closedJobs = q.run(
      q.db
        .updateTable('jobs')
        .set({ status: 'possibly_closed', updated_at: now })
        .where('status', '=', 'active')
        .where(({ not, exists, selectFrom }) =>
          not(exists(selectFrom('job_listings as l').select('l.id').whereRef('l.job_id', '=', 'jobs.id').where('l.status', '=', 'active'))),
        ),
    ).changes;
    return { missed, closedJobs };
  });
}

export interface JobForScore {
  id: number;
  title: string;
  description_text: string | null;
  technologies: string;
  remote_type: string;
  geo_eligibility: string;
  contract_types: string;
  seniority: string;
  published_at: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
}

export function listJobsForScore(q: Q): JobForScore[] {
  return q.all(
    q.db
      .selectFrom('jobs')
      .select([
        'id', 'title', 'description_text', 'technologies', 'remote_type', 'geo_eligibility', 'contract_types',
        'seniority', 'published_at', 'salary_min', 'salary_max', 'salary_currency',
      ]),
  );
}

export function updateScores(q: Q, scores: { id: number; score: number; breakdown: ScoreReason[] }[]): void {
  q.tx(() => {
    for (const s of scores) {
      q.run(q.db.updateTable('jobs').set({ score: s.score, score_breakdown: JSON.stringify(s.breakdown) }).where('id', '=', s.id));
    }
  });
}

export function listRawListings(q: Q, source?: string) {
  let query = q.db.selectFrom('job_listings').select(['id', 'source', 'raw']).where('raw', 'is not', null);
  if (source) query = query.where('source', '=', source);
  return q.all(query.orderBy('id'));
}

/**
 * Optional retention (off by default): deletes jobs that are possibly closed and were last
 * seen more than `days` ago. Jobs with personal data (favorite, notes, non-new state) are kept.
 */
export function applyRetention(q: Q, days: number | null, now = new Date()): number {
  if (days === null) return 0;
  const cutoff = new Date(now.getTime() - days * 86_400_000).toISOString();
  return q.run(
    q.db
      .deleteFrom('jobs')
      .where('status', '=', 'possibly_closed')
      .where('last_seen_at', '<', cutoff)
      .where(({ not, exists, selectFrom }) =>
        not(
          exists(
            selectFrom('job_tracking as t')
              .select('t.job_id')
              .whereRef('t.job_id', '=', 'jobs.id')
              .where((eb) => eb.or([eb('t.favorite', '=', 1), eb('t.notes', '!=', ''), eb('t.state', '!=', 'new')])),
          ),
        ),
      ),
  ).changes;
}
