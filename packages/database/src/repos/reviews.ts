import type { Q } from '../exec.ts';

export function listReviews(q: Q, status: string, limit: number, offset: number) {
  // a pending pair whose job disappeared (merged elsewhere, retention) is no longer actionable
  const base = q.db
    .selectFrom('dedup_reviews')
    .where('status', '=', status)
    .$if(status === 'pending', (qb) => qb.where('job_id', 'is not', null).where('candidate_job_id', 'is not', null));
  const rows = q.all(
    base
      .selectAll()
      .orderBy(status === 'pending' ? 'confidence' : 'resolved_at', 'desc')
      .orderBy('id')
      .limit(limit)
      .offset(offset),
  );
  const total = q.get(base.select((eb) => eb.fn.countAll<number>().as('n')))!.n;
  return { rows, total };
}

export function getReview(q: Q, id: number) {
  return q.get(q.db.selectFrom('dedup_reviews').selectAll().where('id', '=', id));
}

export function dismissReview(q: Q, id: number, now: string): void {
  q.run(q.db.updateTable('dedup_reviews').set({ status: 'dismissed', resolved_at: now }).where('id', '=', id));
}

/**
 * Manual merge: moves the listings (and personal data, when the kept job has none) of
 * `dropId` into `keepId`, records the decision and deletes the emptied job.
 */
export function mergeJobs(q: Q, reviewId: number, keepId: number, dropId: number, now: string): void {
  q.tx(() => {
    q.run(q.db.updateTable('job_listings').set({ job_id: keepId, match_method: 'manual', match_confidence: 1 }).where('job_id', '=', dropId));
    const keepTracking = q.get(q.db.selectFrom('job_tracking').select('job_id').where('job_id', '=', keepId));
    if (!keepTracking) q.run(q.db.updateTable('job_tracking').set({ job_id: keepId }).where('job_id', '=', dropId));
    q.run(q.db.updateTable('job_state_history').set({ job_id: keepId }).where('job_id', '=', dropId));
    const drop = q.get(q.db.selectFrom('jobs').select(['published_at', 'first_seen_at', 'last_seen_at']).where('id', '=', dropId));
    if (drop) {
      const keep = q.get(q.db.selectFrom('jobs').select(['published_at', 'first_seen_at', 'last_seen_at']).where('id', '=', keepId))!;
      q.run(
        q.db
          .updateTable('jobs')
          .set({
            published_at: keep.published_at ?? drop.published_at,
            first_seen_at: keep.first_seen_at < drop.first_seen_at ? keep.first_seen_at : drop.first_seen_at,
            last_seen_at: keep.last_seen_at > drop.last_seen_at ? keep.last_seen_at : drop.last_seen_at,
            status: 'active',
            updated_at: now,
          })
          .where('id', '=', keepId),
      );
    }
    const dropped = q.get(q.db.selectFrom('jobs').select(['title', 'company']).where('id', '=', dropId));
    q.run(
      q.db
        .updateTable('dedup_reviews')
        .set({ status: 'merged', resolved_at: now, kept_job_id: keepId, merged_title: dropped?.title ?? null, merged_company: dropped?.company ?? null })
        .where('id', '=', reviewId),
    );
    // other pending pairs of the absorbed job are moot
    q.run(
      q.db
        .deleteFrom('dedup_reviews')
        .where('status', '=', 'pending')
        .where('id', '!=', reviewId)
        .where((eb) => eb.or([eb('job_id', '=', dropId), eb('candidate_job_id', '=', dropId)])),
    );
    q.run(q.db.deleteFrom('jobs').where('id', '=', dropId));
  });
}
