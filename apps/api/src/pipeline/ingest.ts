import { createHash } from 'node:crypto';
import {
  addDedupReview,
  addListing,
  findCandidates,
  findListing,
  isListingDeleted,
  insertJob,
  listJobsForScore,
  refreshListing,
  updateScores,
  type JobWrite,
  type Q,
} from '@ajh/database';
import { decideMatch, identityHash, normalizeCompany, scoreJob } from '@ajh/job-sources';
import type { ContractType, GeoTag, NormalizedJob, Profile, RemoteType, Seniority } from '@ajh/shared';

export type IngestKind = 'new' | 'updated' | 'unchanged' | 'merged' | 'deleted';

export interface IngestResult {
  kind: IngestKind;
  jobId: number;
  listingId: number;
  reviews: number;
}

function contentHash(j: NormalizedJob): string {
  return createHash('sha1')
    .update(
      JSON.stringify([
        j.title, j.company, j.descriptionText, j.locationRaw, j.remoteType, j.salaryMin, j.salaryMax,
        j.salaryCurrency, j.publishedAt, j.url, j.technologies, j.geoEligibility, j.contractTypes, j.seniority,
      ]),
    )
    .digest('hex');
}

/**
 * Upserts one normalized job atomically. Dedup layer 1 (source + id) first; otherwise layers
 * 2–5 decide between merging into an existing job, or creating a new one (possibly with
 * review entries for doubtful matches).
 */
export function ingestJob(
  q: Q,
  job: NormalizedJob,
  profile: Profile,
  now: Date,
  raw: unknown = null,
  { sighting = true }: { sighting?: boolean } = {},
): IngestResult {
  const nowIso = now.toISOString();
  const { score, breakdown } = scoreJob(job, profile, now);
  const w: JobWrite = {
    ...job,
    identityHash: identityHash(job),
    companyNormalized: normalizeCompany(job.company),
    contentHash: contentHash(job),
    raw: raw === null ? null : JSON.stringify(raw),
    score,
    scoreBreakdown: breakdown,
  };
  return q.tx(() => {
    // the user deleted this posting: do not bring it back
    if (isListingDeleted(q, job.source, job.sourceJobId)) return { kind: 'deleted', jobId: 0, listingId: 0, reviews: 0 };
    const existing = findListing(q, job.source, job.sourceJobId);
    if (existing) {
      return { kind: refreshListing(q, existing, w, nowIso, { sighting }), jobId: existing.job_id, listingId: existing.id, reviews: 0 };
    }
    const decision = decideMatch({ ...job, identityHash: w.identityHash }, findCandidates(q, w));
    if (decision.action === 'merge') {
      const listingId = addListing(q, decision.jobId, w, decision.method, decision.confidence, nowIso);
      return { kind: 'merged', jobId: decision.jobId, listingId, reviews: 0 };
    }
    const { jobId, listingId } = insertJob(q, w, nowIso);
    for (const r of decision.reviews) addDedupReview(q, jobId, r.jobId, r.confidence, r.method, nowIso);
    return { kind: 'new', jobId, listingId, reviews: decision.reviews.length };
  });
}

/** Recomputes every job's score from its consolidated data (profile change, recency decay). */
export function rescoreAll(q: Q, profile: Profile, now: Date = new Date()): number {
  const rows = listJobsForScore(q);
  const scores = rows.map((r) => {
    const { score, breakdown } = scoreJob(
      {
        title: r.title,
        descriptionText: r.description_text,
        technologies: JSON.parse(r.technologies) as string[],
        remoteType: r.remote_type as RemoteType,
        geoEligibility: JSON.parse(r.geo_eligibility) as GeoTag[],
        contractTypes: JSON.parse(r.contract_types) as ContractType[],
        seniority: r.seniority as Seniority,
        publishedAt: r.published_at,
        salaryMin: r.salary_min,
        salaryMax: r.salary_max,
        salaryCurrency: r.salary_currency,
      },
      profile,
      now,
    );
    return { id: r.id, score, breakdown };
  });
  updateScores(q, scores);
  return scores.length;
}

/**
 * Rebuilds the pending review queue with the current dedup rules (resolved reviews are kept).
 * Maintenance never merges: a pair the rules would now auto-merge is queued for review instead.
 */
export function rebuildPendingReviews(q: Q, now: Date = new Date()): number {
  const nowIso = now.toISOString();
  return q.tx(() => {
    q.run(q.db.deleteFrom('dedup_reviews').where('status', '=', 'pending'));
    const resolved = new Set(
      q.all(q.db.selectFrom('dedup_reviews').select(['job_id', 'candidate_job_id'])).map((r) => `${r.job_id}:${r.candidate_job_id}`),
    );
    const jobs = q.all(
      q.db
        .selectFrom('jobs')
        .select(['id', 'title', 'company', 'description_text', 'canonical_url', 'identity_hash', 'company_normalized'])
        .where('company_normalized', 'is not', null),
    );
    let created = 0;
    for (const j of jobs) {
      const sources = q.all(q.db.selectFrom('job_listings').select('source').where('job_id', '=', j.id)).map((r) => r.source);
      const candidates = findCandidates(q, { canonicalUrl: null, atsKey: null, identityHash: null, companyNormalized: j.company_normalized })
        .filter((c) => c.jobId > j.id && !c.sources.some((s) => sources.includes(s)));
      for (const source of sources.slice(0, 1)) {
        const d = decideMatch(
          { source, title: j.title, company: j.company, descriptionText: j.description_text, canonicalUrl: null, atsKey: null, identityHash: null },
          candidates,
        );
        const pairs = d.action === 'merge' ? [{ jobId: d.jobId, confidence: d.confidence, method: d.method }] : d.reviews;
        for (const r of pairs) {
          if (resolved.has(`${j.id}:${r.jobId}`)) continue;
          addDedupReview(q, j.id, r.jobId, r.confidence, r.method, nowIso);
          created++;
        }
      }
    }
    return created;
  });
}
