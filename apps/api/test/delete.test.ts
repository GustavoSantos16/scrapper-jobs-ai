import { buildJob, type AnyConnector } from '@ajh/job-sources';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestEnv, type TestEnv } from './helpers.ts';

/** Test-only source; `ids.current` can change between captures. Same title/company across sources merge. */
function seed(source: string, ids: { current: number[] }, shared = false): AnyConnector {
  return {
    id: source,
    name: source,
    kind: 'official_api',
    homepageUrl: 'https://example.test',
    docsUrl: 'https://example.test',
    attribution: source,
    description: 'test',
    rateLimit: { minIntervalMinutes: 0, maxRequestsPerRun: 1, minDelayMs: 0 },
    allowedHosts: ['example.test'],
    async *fetchJobs() {
      yield* ids.current;
    },
    normalize: (i: number) =>
      buildJob({
        source,
        sourceJobId: i,
        title: shared ? 'Senior React Engineer' : `React role ${i}`,
        company: shared ? 'Acme' : `Co ${i}`,
        url: `https://example.test/${source}/${i}`,
        publishedAt: null,
      }),
  };
}

const posted = { current: [1, 2, 3] };
let env: TestEnv;
let ids: number[];
beforeEach(async () => {
  posted.current = [1, 2, 3];
  env = await createTestEnv({ connectors: [seed('a', posted)] });
  await env.runner.start({ trigger: 'manual' }).done;
  ids = (env.database.sqlite.prepare('SELECT id FROM jobs ORDER BY id').all() as { id: number }[]).map((r) => r.id);
});
afterEach(async () => env.close());

const count = (sql: string) => (env.database.sqlite.prepare(sql).get() as { n: number }).n;

describe('DELETE /api/jobs/:id', () => {
  it('removes the job with its personal data and keeps the others', async () => {
    const id = ids[0]!;
    await env.app.inject({ method: 'PATCH', url: `/api/jobs/${id}/tracking`, payload: { favorite: true, notes: 'x', state: 'applied' } });
    const res = await env.app.inject({ method: 'DELETE', url: `/api/jobs/${id}` });
    expect(res.json()).toEqual({ ok: true, removedListings: 1 });
    expect((await env.app.inject({ url: `/api/jobs/${id}` })).statusCode).toBe(404);
    expect(count('SELECT COUNT(*) n FROM jobs')).toBe(2);
    expect(count(`SELECT COUNT(*) n FROM job_listings WHERE job_id = ${id}`)).toBe(0);
    expect(count(`SELECT COUNT(*) n FROM job_tracking WHERE job_id = ${id}`)).toBe(0);
    expect(count(`SELECT COUNT(*) n FROM job_state_history WHERE job_id = ${id}`)).toBe(0);
    expect(count('SELECT COUNT(*) n FROM jobs_fts WHERE jobs_fts MATCH \'"React"\'')).toBe(2); // search index in sync
    expect((await env.app.inject({ method: 'DELETE', url: `/api/jobs/${id}` })).statusCode).toBe(404);
  });

  it('does not come back on the next capture, while new postings still arrive', async () => {
    await env.app.inject({ method: 'DELETE', url: `/api/jobs/${ids[0]!}` });
    posted.current = [1, 2, 3, 4]; // the source still publishes #1 and now also #4
    const summary = await env.runner.start({ trigger: 'manual' }).done;
    expect(summary.sources[0]).toMatchObject({ status: 'success', found: 3, new: 1 }); // 2, 3 seen again + 4 new; 1 skipped
    const titles = (env.database.sqlite.prepare('SELECT title FROM jobs ORDER BY title').all() as { title: string }[]).map((r) => r.title);
    expect(titles).toEqual(['React role 2', 'React role 3', 'React role 4']);
  });
});

describe('deleting a consolidated job', () => {
  it('removes every source listing and blocks them all', async () => {
    const one = { current: [1] };
    const e2 = await createTestEnv({ connectors: [seed('a', one, true), seed('b', one, true)] });
    await e2.runner.start({ trigger: 'manual' }).done;
    const count2 = (sql: string) => (e2.database.sqlite.prepare(sql).get() as { n: number }).n;
    expect(count2('SELECT COUNT(*) n FROM jobs')).toBe(1);
    expect(count2('SELECT COUNT(*) n FROM job_listings')).toBe(2);
    const jobId = (e2.database.sqlite.prepare('SELECT id FROM jobs').get() as { id: number }).id;
    expect((await e2.app.inject({ method: 'DELETE', url: `/api/jobs/${jobId}` })).json()).toEqual({ ok: true, removedListings: 2 });
    expect(count2('SELECT COUNT(*) n FROM deleted_listings')).toBe(2);
    await e2.runner.start({ trigger: 'manual' }).done;
    expect(count2('SELECT COUNT(*) n FROM jobs')).toBe(0); // neither source brings it back
    await e2.close();
  });
});
