import { remoteok } from '@ajh/job-sources';
import { fixtureTransport } from '@ajh/job-sources/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { reprocessAll } from '../src/pipeline/reprocess.ts';
import { createTestEnv, type TestEnv } from './helpers.ts';

const fx = (n: string) => new URL(`../../../packages/job-sources/test/fixtures/${n}`, import.meta.url).pathname;
let env: TestEnv;
afterEach(async () => env?.close());

describe('reprocessAll', () => {
  it('re-normalizes stored raw payloads without network and without counting a sighting', async () => {
    const transport = fixtureTransport([['remoteok.com/api', fx('remoteok.json')]]);
    env = await createTestEnv({ connectors: [remoteok], transport });
    await env.runner.start({ trigger: 'manual' }).done;
    const { sqlite } = env.database;
    sqlite.prepare("UPDATE job_listings SET status = 'possibly_closed', missed_runs = 5, last_seen_at = '2026-01-01T00:00:00.000Z'").run();
    sqlite.prepare("UPDATE jobs SET title = 'stale title', remote_type = 'unknown'").run();
    sqlite.prepare("UPDATE job_listings SET content_hash = 'old'").run();
    const calls = transport.calls.length;

    const stats = reprocessAll(env.database, [remoteok]);
    expect(stats.listings).toBe(3);
    expect(stats.updated).toBe(3);
    expect(transport.calls.length).toBe(calls); // no network
    const job = sqlite.prepare('SELECT title, remote_type FROM jobs ORDER BY id LIMIT 1').get() as { title: string; remote_type: string };
    expect(job.title).not.toBe('stale title');
    expect(job.remote_type).toBe('remote');
    const listing = sqlite.prepare('SELECT status, missed_runs, last_seen_at FROM job_listings ORDER BY id LIMIT 1').get();
    expect(listing).toEqual({ status: 'possibly_closed', missed_runs: 5, last_seen_at: '2026-01-01T00:00:00.000Z' });
  });
});
