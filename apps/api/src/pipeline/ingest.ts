import { createHash } from 'node:crypto';
import {
  addDedupReview,
  addListing,
  findCandidates,
  findListing,
  insertJob,
  listJobsForScore,
  refreshListing,
  updateScores,
  type JobWrite,
  type Q,
} from '@ajh/database';
import { decideMatch, identityHash, normalizeCompany, scoreJob } from '@ajh/job-sources';
import type { ContractType, GeoTag, NormalizedJob, Profile, RemoteType, Seniority } from '@ajh/shared';

export type IngestKind = 'new' | 'updated' | 'unchanged' | 'merged';

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
