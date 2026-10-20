import { findListing, listRawListings, type Database } from '@ajh/database';
import type { AnyConnector } from '@ajh/job-sources';
import { NormalizedJob } from '@ajh/shared';
import { readSettings } from '../config/settings.ts';
import { ingestJob, rescoreAll } from './ingest.ts';

/**
 * Re-normalizes every stored listing from its raw payload with the current connector code,
 * then rescores. No network access: used after normalization rules change.
 */
export function reprocessAll(database: Database, connectors: AnyConnector[], now = new Date()) {
  const { q } = database;
  const profile = readSettings(q, 'profile');
  const byId = new Map(connectors.map((c) => [c.id, c]));
  const stats = { listings: 0, updated: 0, unchanged: 0, invalid: 0, skipped: 0 };
  for (const row of listRawListings(q)) {
    stats.listings++;
    const connector = byId.get(row.source);
    if (!connector) {
      stats.skipped++;
      continue;
    }
    let job: NormalizedJob | null;
    try {
      job = connector.normalize(JSON.parse(row.raw!), { now });
    } catch {
      stats.invalid++;
      continue;
    }
    const parsed = job && NormalizedJob.safeParse(job);
    if (!parsed?.success) {
      stats.invalid++;
      continue;
    }
    const before = findListing(q, parsed.data.source, parsed.data.sourceJobId);
    if (!before) {
      stats.skipped++;
      continue;
    }
    // reprocessing is not a sighting: last seen / missed runs / status stay as they are
    const r = ingestJob(q, parsed.data, profile, now, JSON.parse(row.raw!), { sighting: false });
    if (r.kind === 'updated') stats.updated++;
    else stats.unchanged++;
  }
  rescoreAll(q, profile, now);
  return stats;
}
