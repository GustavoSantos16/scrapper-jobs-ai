import type { Q } from '../exec.ts';

export interface TrackingPatch {
  state?: string;
  favorite?: boolean;
  ignored?: boolean;
  notes?: string;
  appliedAt?: string | null;
  recruiter?: string | null;
  processUrl?: string | null;
}

const COLUMN = {
  state: 'state',
  favorite: 'favorite',
  ignored: 'ignored',
  notes: 'notes',
  appliedAt: 'applied_at',
  recruiter: 'recruiter',
  processUrl: 'process_url',
} as const;

const str = (v: unknown): string | null => (v === null || v === undefined ? null : typeof v === 'boolean' ? (v ? '1' : '0') : String(v));

/**
 * Updates personal data and appends one history row per field that actually changed.
 * Returns the changed field names.
 */
export function updateTracking(q: Q, jobId: number, patch: TrackingPatch, now = new Date().toISOString()): string[] {
  return q.tx(() => {
    const current = q.get(q.db.selectFrom('job_tracking').selectAll().where('job_id', '=', jobId)) ?? {
      job_id: jobId,
      state: 'new',
      favorite: 0,
      ignored: 0,
      notes: '',
      applied_at: null,
      recruiter: null,
      process_url: null,
      updated_at: now,
    };
    const next = { ...current };
    const changed: string[] = [];
    for (const [key, col] of Object.entries(COLUMN) as [keyof TrackingPatch, (typeof COLUMN)[keyof typeof COLUMN]][]) {
      if (!(key in patch) || patch[key] === undefined) continue;
      const raw = patch[key];
      const value = typeof raw === 'boolean' ? (raw ? 1 : 0) : raw;
      if (str(current[col]) === str(value)) continue;
      (next as Record<string, unknown>)[col] = value;
      changed.push(key);
      q.run(
        q.db.insertInto('job_state_history').values({
          job_id: jobId,
          field: key,
          old_value: key === 'notes' ? null : str(current[col]),
          new_value: key === 'notes' ? null : str(value),
          changed_at: now,
        }),
      );
    }
    // applying sets the application date once, unless the user gave one
    if (patch.state === 'applied' && !next.applied_at && !('appliedAt' in patch)) {
      next.applied_at = now;
      changed.push('appliedAt');
    }
    if (!changed.length) return changed;
    next.updated_at = now;
    q.run(q.db.insertInto('job_tracking').values(next).onConflict((oc) => oc.column('job_id').doUpdateSet(next)));
    return changed;
  });
}
