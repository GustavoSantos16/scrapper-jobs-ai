import type { Q } from '../exec.ts';

export function getJobRow(q: Q, id: number) {
  return q.get(q.db.selectFrom('jobs').selectAll().where('id', '=', id));
}

export function getListings(q: Q, jobId: number) {
  return q.all(
    q.db
      .selectFrom('job_listings')
      .select([
        'id', 'source', 'source_job_id', 'url', 'published_at', 'first_seen_at', 'last_seen_at', 'status', 'missed_runs',
        'match_method', 'match_confidence',
      ])
      .where('job_id', '=', jobId)
      .orderBy('id'),
  );
}

export function getTracking(q: Q, jobId: number) {
  return q.get(q.db.selectFrom('job_tracking').selectAll().where('job_id', '=', jobId));
}

export function getHistory(q: Q, jobId: number) {
  return q.all(q.db.selectFrom('job_state_history').selectAll().where('job_id', '=', jobId).orderBy('changed_at', 'desc').orderBy('id', 'desc'));
}

/** Pending/resolved review pairs that involve this job, with the other job's title. */
export function getReviewsForJob(q: Q, jobId: number) {
  const pairs = q.all(
    q.db
      .selectFrom('dedup_reviews')
      .select(['id', 'job_id', 'candidate_job_id', 'confidence', 'status'])
      .where('status', '=', 'pending')
      .where((eb) => eb.or([eb('job_id', '=', jobId), eb('candidate_job_id', '=', jobId)])),
  );
  return pairs.flatMap((p) => {
    const otherId = p.job_id === jobId ? p.candidate_job_id : p.job_id;
    if (otherId === null) return [];
    const other = q.get(q.db.selectFrom('jobs').select(['title', 'company']).where('id', '=', otherId));
    return [{ id: p.id, otherJobId: otherId, otherTitle: other?.title ?? '', otherCompany: other?.company ?? null, confidence: p.confidence, status: p.status }];
  });
}
