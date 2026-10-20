import { acquireLock, getRun, getSourceState, upsertSourceState } from '@ajh/database';
import { buildJob, himalayas, jobicy, remoteok, type AnyConnector } from '@ajh/job-sources';
import { fixtureTransport } from '@ajh/job-sources/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { LOCK_NAME } from '../src/pipeline/runner.ts';
import { createTestEnv, type TestEnv } from './helpers.ts';

const FX = new URL('../../../packages/job-sources/test/fixtures/', import.meta.url);
const fx = (n: string) => new URL(n, FX).pathname;
const realTransport = () =>
  fixtureTransport([
    ['jobicy.com/api', fx('jobicy.json')],
    ['remoteok.com/api', fx('remoteok.json')],
    ['himalayas.app/jobs/api/search', fx('himalayas.json')],
  ]);

/** Test-only connector: yields `count` synthetic jobs, optionally failing or hanging. */
function fakeConnector(id: string, opts: { count?: number; failAfter?: number; hang?: boolean; requiredEnv?: string[]; minIntervalMinutes?: number } = {}): AnyConnector {
  return {
    id,
    name: id,
    kind: 'official_api',
    homepageUrl: 'https://example.test',
    docsUrl: 'https://example.test/docs',
    attribution: id,
    description: 'test',
    rateLimit: { minIntervalMinutes: opts.minIntervalMinutes ?? 0, maxRequestsPerRun: 10, minDelayMs: 0 },
    allowedHosts: ['example.test'],
    ...(opts.requiredEnv && { requiredEnv: opts.requiredEnv }),
    async *fetchJobs({ signal }) {
      for (let i = 0; i < (opts.count ?? 3); i++) {
        if (opts.failAfter !== undefined && i === opts.failAfter) throw new Error(`${id} exploded`);
        yield { i };
      }
      if (opts.hang) await new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
    },
    normalize(raw: { i: number }) {
      return buildJob({
        source: id,
        sourceJobId: `${id}-${raw.i}`,
        title: `Frontend Engineer ${id} ${raw.i}`,
        company: `Company ${id} ${raw.i}`,
        url: `https://example.test/${id}/${raw.i}`,
        publishedAt: null,
      });
    },
  };
}

let env: TestEnv;
afterEach(async () => env?.close());

describe('capture pipeline with real connectors on recorded fixtures', () => {
  it('captures, normalizes, dedups and persists jobs from 3 sources', async () => {
    env = await createTestEnv({ connectors: [jobicy, remoteok, himalayas], transport: realTransport() });
    const { runId, done } = env.runner.start({ trigger: 'manual' });
    const summary = await done;
    expect(summary.status).toBe('success');
    const run = getRun(env.database.q, runId)!;
    expect(run.sources.map((s) => [s.source, s.status])).toEqual([
      ['jobicy', 'success'],
      ['remoteok', 'success'],
      ['himalayas', 'success'],
    ]);
    // jobicy returns the same 3 jobs for its 3 queries: counted once
    expect(run.sources.find((s) => s.source === 'jobicy')!.found).toBe(3);
    expect(run.jobs_found).toBe(3 + 3 + 3);

    const res = await env.app.inject({ url: '/api/jobs?pageSize=50' });
    const body = res.json();
    expect(body.total).toBeGreaterThan(0);
    expect(body.total).toBeLessThanOrEqual(9);
    // scores were computed and the dates are honest
    const rows = env.database.sqlite.prepare('SELECT score, published_at, first_seen_at FROM jobs').all() as {
      score: number;
      published_at: string | null;
      first_seen_at: string;
    }[];
    expect(rows.every((r) => r.score >= 0 && r.score <= 100)).toBe(true);
    expect(rows.every((r) => r.published_at !== r.first_seen_at)).toBe(true);
    expect(getSourceState(env.database.q, 'jobicy')!.last_success_at).not.toBeNull();
  });

  it('is idempotent: a second run updates instead of duplicating', async () => {
    env = await createTestEnv({ connectors: [remoteok], transport: realTransport() });
    await env.runner.start({ trigger: 'manual' }).done;
    const first = env.database.sqlite.prepare('SELECT COUNT(*) n FROM jobs').get() as { n: number };
    upsertSourceState(env.database.q, 'remoteok', { last_run_at: null }); // bypass min interval for the test
    const second = await env.runner.start({ trigger: 'manual' }).done;
    expect(second.sources[0]!.new).toBe(0);
    expect((env.database.sqlite.prepare('SELECT COUNT(*) n FROM jobs').get() as { n: number }).n).toBe(first.n);
  });
});

describe('failure isolation and robustness', () => {
  it('a failing source does not stop the others and its partial results are kept', async () => {
    env = await createTestEnv({
      connectors: [fakeConnector('ok-a'), fakeConnector('broken', { count: 5, failAfter: 2 }), fakeConnector('ok-b')],
    });
    const summary = await env.runner.start({ trigger: 'manual' }).done;
    expect(summary.status).toBe('partial');
    const bySource = Object.fromEntries(summary.sources.map((s) => [s.source, s]));
    expect(bySource['ok-a']!.status).toBe('success');
    expect(bySource['ok-b']!.status).toBe('success');
    expect(bySource['broken']!.status).toBe('failed');
    expect(bySource['broken']!.error).toBe('broken exploded');
    expect(bySource['broken']!.found).toBe(2); // partial results persisted
    const count = (env.database.sqlite.prepare("SELECT COUNT(*) n FROM job_listings WHERE source='broken'").get() as { n: number }).n;
    expect(count).toBe(2);
    const state = getSourceState(env.database.q, 'broken')!;
    expect(state.last_status).toBe('failed');
    expect(state.last_success_at).toBeNull();
    expect(state.consecutive_failures).toBe(1);
  });

  it('times out a hanging source without affecting the rest', async () => {
    env = await createTestEnv({ connectors: [fakeConnector('hangs', { count: 1, hang: true }), fakeConnector('fine')] });
    env.database.sqlite.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('pipeline', ?, ?)").run(
      JSON.stringify({ concurrency: 2, sourceTimeoutSeconds: 10, missedRunsThreshold: 3, retentionDays: null }),
      new Date().toISOString(),
    );
    const started = Date.now();
    const { done } = env.runner.start({ trigger: 'manual' });
    const summary = await done;
    expect(Date.now() - started).toBeLessThan(12_000);
    const hang = summary.sources.find((s) => s.source === 'hangs')!;
    expect(hang.status).toBe('failed');
    expect(hang.error).toMatch(/Timeout after 10s/);
    expect(summary.sources.find((s) => s.source === 'fine')!.status).toBe('success');
  }, 15_000);

  it('can be cancelled', async () => {
    env = await createTestEnv({ connectors: [fakeConnector('slow', { count: 1, hang: true })] });
    const { runId, done } = env.runner.start({ trigger: 'manual' });
    await new Promise((r) => setTimeout(r, 50));
    expect(env.runner.cancel(runId)).toBe(true);
    const summary = await done;
    expect(summary.status).toBe('cancelled');
    expect(getRun(env.database.q, runId)!.sources[0]!.status).toBe('cancelled');
  });

  it('never runs two captures at once (in-process and across processes)', async () => {
    env = await createTestEnv({ connectors: [fakeConnector('slow', { count: 1, hang: true })] });
    const first = env.runner.start({ trigger: 'manual' });
    expect(() => env.runner.start({ trigger: 'manual' })).toThrow(/already in progress/);
    const res = await env.app.inject({ method: 'POST', url: '/api/runs' });
    expect(res.statusCode).toBe(409);
    env.runner.cancel(first.runId);
    await first.done;
    // another process holding a valid lock blocks us
    acquireLock(env.database.q, LOCK_NAME, 'other-process', 60_000);
    expect(() => env.runner.start({ trigger: 'manual' })).toThrow(/another process/);
  });

  it('recovers from a crashed process: an expired lock is taken over and orphan runs are closed', async () => {
    env = await createTestEnv({ connectors: [fakeConnector('a')] });
    acquireLock(env.database.q, LOCK_NAME, 'dead-process', 1000, new Date(Date.now() - 60_000)); // expired
    env.database.sqlite.prepare("INSERT INTO runs (trigger, status, started_at) VALUES ('manual','running',?)").run(new Date().toISOString());
    expect(env.runner.recover()).toBe(1);
    const summary = await env.runner.start({ trigger: 'manual' }).done;
    expect(summary.status).toBe('success');
  });
});

describe('source eligibility', () => {
  it('skips sources inside their minimum interval, with the reason recorded', async () => {
    env = await createTestEnv({ connectors: [fakeConnector('limited', { minIntervalMinutes: 360 })] });
    await env.runner.start({ trigger: 'manual' }).done;
    const second = await env.runner.start({ trigger: 'manual' }).done;
    expect(second.status).toBe('skipped');
    const run = getRun(env.database.q, second.runId)!;
    expect(run.sources[0]!.status).toBe('skipped');
    expect(run.sources[0]!.skip_reason).toMatch(/^min_interval: Intervalo mínimo de 360 min/);
  });

  it('a user override can raise but never lower the minimum interval', async () => {
    const { effectiveIntervalMinutes } = await import('../src/pipeline/runner.ts');
    const c = fakeConnector('x', { minIntervalMinutes: 60 });
    expect(effectiveIntervalMinutes(c, 30)).toBe(60);
    expect(effectiveIntervalMinutes(c, 120)).toBe(120);
  });

  it('skips sources whose credentials are missing', async () => {
    env = await createTestEnv({ connectors: [fakeConnector('keyed', { requiredEnv: ['SOME_KEY'] })] });
    const s = await env.runner.start({ trigger: 'manual' }).done;
    expect(getRun(env.database.q, s.runId)!.sources[0]!.skip_reason).toMatch(/missing_credentials: Requer credencial: SOME_KEY/);
  });

  it('skips disabled sources', async () => {
    env = await createTestEnv({ connectors: [fakeConnector('off')] });
    upsertSourceState(env.database.q, 'off', { enabled: 0 });
    const s = await env.runner.start({ trigger: 'manual' }).done;
    expect(getRun(env.database.q, s.runId)!.sources[0]!.skip_reason).toMatch(/^disabled/);
  });
});
