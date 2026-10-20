import { openDatabase, type Database } from '@ajh/database';
import { buildJob, type AnyConnector } from '@ajh/job-sources';
import { afterEach, describe, expect, it } from 'vitest';
import { CaptureRunner } from '../src/pipeline/runner.ts';
import { CATCH_UP_DELAY_MS, Scheduler } from '../src/scheduler.ts';
import { silentLog } from './helpers.ts';

/** Test-only connector that can block until released, to simulate a long capture. */
function source(gate?: { wait: Promise<void> }): AnyConnector {
  return {
    id: 'src',
    name: 'src',
    kind: 'official_api',
    homepageUrl: 'https://example.test',
    docsUrl: 'https://example.test',
    attribution: 'src',
    description: 'test',
    rateLimit: { minIntervalMinutes: 0, maxRequestsPerRun: 1, minDelayMs: 0 },
    allowedHosts: ['example.test'],
    async *fetchJobs() {
      if (gate) await gate.wait;
      yield 1;
    },
    normalize: () => buildJob({ source: 'src', sourceJobId: 1, title: 'Frontend', url: 'https://example.test/1', publishedAt: null }),
  };
}

/** Manual clock + timer queue. */
function harness(database: Database, connector: AnyConnector) {
  let now = new Date('2026-10-20T12:00:00Z');
  const timers: { fn: () => void; at: number }[] = [];
  const runner = new CaptureRunner({ database, connectors: [connector], env: {}, log: silentLog, loadCompanies: () => [], now: () => now });
  const make = () =>
    new Scheduler({
      database,
      runner,
      log: silentLog,
      now: () => now,
      setTimer: (fn, ms) => {
        const t = { fn, at: now.getTime() + ms };
        timers.push(t);
        return t;
      },
      clearTimer: (t) => timers.splice(timers.indexOf(t as (typeof timers)[number]), 1),
    });
  return {
    runner,
    make,
    timers,
    /** Advances the clock and runs due timers. */
    async advance(ms: number) {
      now = new Date(now.getTime() + ms);
      for (const t of [...timers].filter((x) => x.at <= now.getTime())) {
        timers.splice(timers.indexOf(t), 1);
        t.fn();
      }
      await new Promise((r) => setTimeout(r, 20));
      await runner.idle();
    },
    get now() {
      return now;
    },
  };
}

const runs = (db: Database) => db.sqlite.prepare("SELECT id, trigger FROM runs ORDER BY id").all() as { id: number; trigger: string }[];
let database: Database;
afterEach(async () => database?.close());

describe('Scheduler', () => {
  it('does nothing in manual mode', async () => {
    database = openDatabase({ path: ':memory:' });
    const h = harness(database, source());
    const s = h.make();
    s.start();
    expect(s.status()).toMatchObject({ interval: 'manual', nextRunAt: null });
    await h.advance(24 * 3600_000);
    expect(runs(database)).toEqual([]);
  });

  it('runs on the configured interval and shows the next run', async () => {
    database = openDatabase({ path: ':memory:' });
    const h = harness(database, source());
    const s = h.make();
    s.start();
    const st = s.configure({ interval: '1h', paused: false });
    expect(st.nextRunAt).toBe('2026-10-20T13:00:00.000Z');
    await h.advance(59 * 60_000);
    expect(runs(database)).toEqual([]);
    await h.advance(60_000);
    expect(runs(database)).toEqual([{ id: 1, trigger: 'scheduled' }]);
    expect(s.status().nextRunAt).toBe('2026-10-20T14:00:00.000Z');
    await h.advance(3600_000);
    expect(runs(database).length).toBe(2);
  });

  it('never overlaps: a slot due while a capture runs is skipped', async () => {
    database = openDatabase({ path: ':memory:' });
    let release!: () => void;
    const gate = { wait: new Promise<void>((r) => (release = r)) };
    const h = harness(database, source(gate));
    const s = h.make();
    s.start();
    s.configure({ interval: '30m', paused: false });
    const manual = h.runner.start({ trigger: 'manual' }); // long manual capture in progress
    // the scheduled slot comes due while the manual capture is still running
    h.timers.splice(0, 1);
    await s.fire();
    expect(s.status().lastSkipReason).toMatch(/já havia uma captura em andamento/);
    release();
    await manual.done;
    expect(runs(database).map((r) => r.trigger)).toEqual(['manual']);
    expect(h.timers.length).toBe(1); // rescheduled
  });

  it('persists configuration across restarts and catches up once after downtime', async () => {
    database = openDatabase({ path: ':memory:' });
    const h = harness(database, source());
    const first = h.make();
    first.start();
    first.configure({ interval: '6h', paused: false });
    first.stop();
    // API stopped for 10 hours
    await h.advance(10 * 3600_000);
    expect(runs(database)).toEqual([]);
    const second = h.make();
    second.start();
    expect(second.status()).toMatchObject({ interval: '6h', paused: false });
    await h.advance(CATCH_UP_DELAY_MS);
    expect(runs(database)).toEqual([{ id: 1, trigger: 'scheduled' }]); // one catch-up, not a burst
  });

  it('pause and resume', async () => {
    database = openDatabase({ path: ':memory:' });
    const h = harness(database, source());
    const s = h.make();
    s.start();
    s.configure({ interval: '30m', paused: true });
    expect(s.status().nextRunAt).toBeNull();
    await h.advance(2 * 3600_000);
    expect(runs(database)).toEqual([]);
    expect(s.configure({ interval: '30m', paused: false }).nextRunAt).toBe(new Date(h.now.getTime() + 30 * 60_000).toISOString());
  });
});
