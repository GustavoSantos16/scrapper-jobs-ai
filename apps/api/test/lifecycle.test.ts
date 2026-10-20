import { applyRetention, getRun } from '@ajh/database';
import { buildJob, type AnyConnector } from '@ajh/job-sources';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestEnv, type TestEnv } from './helpers.ts';

/** Test-only connector whose result set can change between runs. */
function mutableConnector(id: string, ids: { current: number[] }): AnyConnector {
  return {
    id,
    name: id,
    kind: 'official_api',
    homepageUrl: 'https://example.test',
    docsUrl: 'https://example.test',
    attribution: id,
    description: 'test',
    rateLimit: { minIntervalMinutes: 0, maxRequestsPerRun: 1, minDelayMs: 0 },
    allowedHosts: ['example.test'],
    async *fetchJobs() {
      for (const i of ids.current) yield { i };
    },
    normalize: (raw: { i: number }) =>
      buildJob({ source: id, sourceJobId: raw.i, title: `Frontend role ${raw.i}`, company: `Co ${raw.i}`, url: `https://example.test/${raw.i}`, publishedAt: null }),
  };
}

let env: TestEnv;
afterEach(async () => env?.close());

const status = (env: TestEnv) =>
  Object.fromEntries(
    (env.database.sqlite.prepare('SELECT j.title, j.status, l.missed_runs FROM jobs j JOIN job_listings l ON l.job_id = j.id').all() as { title: string; status: string; missed_runs: number }[]).map(
      (r) => [r.title, `${r.status}/${r.missed_runs}`],
    ),
  );

describe('job lifecycle', () => {
  it('marks a job possibly closed after N successful runs without it, and reactivates it when it returns', async () => {
    const ids = { current: [1, 2] };
    env = await createTestEnv({ connectors: [mutableConnector('src', ids)] });
    await env.runner.start({ trigger: 'manual' }).done;
    ids.current = [1];
    for (let i = 0; i < 3; i++) await env.runner.start({ trigger: 'manual' }).done;
    expect(status(env)).toEqual({ 'Frontend role 1': 'active/0', 'Frontend role 2': 'possibly_closed/3' });
    // nothing is deleted
    expect((env.database.sqlite.prepare('SELECT COUNT(*) n FROM jobs').get() as { n: number }).n).toBe(2);
    ids.current = [1, 2];
    await env.runner.start({ trigger: 'manual' }).done;
    expect(status(env)['Frontend role 2']).toBe('active/0');
  });

  it('does not age listings when a run fails or returns nothing', async () => {
    const ids = { current: [1] };
    env = await createTestEnv({ connectors: [mutableConnector('src', ids)] });
    await env.runner.start({ trigger: 'manual' }).done;
    ids.current = [];
    for (let i = 0; i < 4; i++) await env.runner.start({ trigger: 'manual' }).done;
    expect(status(env)).toEqual({ 'Frontend role 1': 'active/0' });
  });

  it('keeps first/last seen and published dates distinct', async () => {
    const ids = { current: [1] };
    let now = new Date('2026-10-20T10:00:00Z');
    env = await createTestEnv({ connectors: [mutableConnector('src', ids)], now: () => now });
    await env.runner.start({ trigger: 'manual' }).done;
    now = new Date('2026-10-21T10:00:00Z');
    await env.runner.start({ trigger: 'manual' }).done;
    const row = env.database.sqlite.prepare('SELECT published_at, first_seen_at, last_seen_at FROM jobs').get();
    expect(row).toEqual({ published_at: null, first_seen_at: '2026-10-20T10:00:00.000Z', last_seen_at: '2026-10-21T10:00:00.000Z' });
  });

  it('retention is off by default and never deletes jobs with personal data', async () => {
    const ids = { current: [1, 2] };
    env = await createTestEnv({ connectors: [mutableConnector('src', ids)] });
    await env.runner.start({ trigger: 'manual' }).done;
    const { sqlite, q } = env.database;
    sqlite.prepare("UPDATE jobs SET status = 'possibly_closed', last_seen_at = '2025-01-01T00:00:00.000Z'").run();
    expect(applyRetention(q, null)).toBe(0);
    const [a] = sqlite.prepare('SELECT id FROM jobs ORDER BY id').all() as { id: number }[];
    sqlite.prepare("INSERT INTO job_tracking (job_id, favorite, updated_at) VALUES (?, 1, '2026-01-01')").run(a!.id);
    expect(applyRetention(q, 30)).toBe(1);
    expect((sqlite.prepare('SELECT id FROM jobs').all() as { id: number }[]).map((r) => r.id)).toEqual([a!.id]);
  });
});

describe('runs API', () => {
  it('starts a run, reports progress and lists history', async () => {
    env = await createTestEnv({ connectors: [mutableConnector('src', { current: [1, 2, 3] })] });
    const start = await env.app.inject({ method: 'POST', url: '/api/runs', payload: {} });
    expect(start.statusCode).toBe(202);
    const { runId } = start.json();
    await env.runner.idle();
    const run = (await env.app.inject({ url: `/api/runs/${runId}` })).json();
    expect(run).toMatchObject({ status: 'success', jobs_found: 3, jobs_new: 3, sources_done: 1 });
    expect(run.sources[0]).toMatchObject({ source: 'src', status: 'success', found: 3, new: 3 });
    const list = (await env.app.inject({ url: '/api/runs' })).json();
    expect(list.total).toBe(1);
    expect(getRun(env.database.q, runId)!.duration_ms).toBeGreaterThanOrEqual(0);
    expect((await env.app.inject({ url: '/api/runs/999' })).statusCode).toBe(404);
    expect((await env.app.inject({ method: 'POST', url: `/api/runs/${runId}/cancel` })).statusCode).toBe(409);
  });
});
