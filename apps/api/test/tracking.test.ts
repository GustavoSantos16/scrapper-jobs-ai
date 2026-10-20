import { buildJob, type AnyConnector } from '@ajh/job-sources';
import type { JobDetail } from '@ajh/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestEnv, type TestEnv } from './helpers.ts';

/** Test-only source with three synthetic jobs. */
const seed: AnyConnector = {
  id: 'seed',
  name: 'Seed',
  kind: 'official_api',
  homepageUrl: 'https://example.test',
  docsUrl: 'https://example.test',
  attribution: 'seed',
  description: 'test',
  rateLimit: { minIntervalMinutes: 0, maxRequestsPerRun: 1, minDelayMs: 0 },
  allowedHosts: ['example.test'],
  async *fetchJobs() {
    yield* [1, 2, 3];
  },
  normalize: (i: number) =>
    buildJob({ source: 'seed', sourceJobId: i, title: i === 1 ? '=HYPERLINK("http://evil")' : `React role ${i}`, company: `Co, "${i}"`, url: `https://example.test/${i}`, publishedAt: null }),
};

let env: TestEnv;
let ids: number[];
beforeEach(async () => {
  env = await createTestEnv({ connectors: [seed] });
  await env.runner.start({ trigger: 'manual' }).done;
  ids = (env.database.sqlite.prepare('SELECT id FROM jobs ORDER BY id').all() as { id: number }[]).map((r) => r.id);
});
afterEach(async () => env.close());

const patch = (id: number, payload: object) => env.app.inject({ method: 'PATCH', url: `/api/jobs/${id}/tracking`, payload });
const detail = async (id: number) => (await env.app.inject({ url: `/api/jobs/${id}` })).json() as JobDetail;

describe('personal tracking', () => {
  it('persists favorites, notes and states with a change history', async () => {
    const id = ids[0]!;
    expect((await patch(id, { favorite: true, notes: 'Falar com a Ana' })).json().changed).toEqual(['favorite', 'notes']);
    expect((await patch(id, { state: 'applied', recruiter: 'Ana' })).json().changed).toEqual(['state', 'recruiter', 'appliedAt']);
    expect((await patch(id, { state: 'applied' })).json().changed).toEqual([]); // no-op is not history
    await patch(id, { state: 'interview', processUrl: 'https://ats.example.test/p/1' });

    const d = await detail(id);
    expect(d.tracking).toMatchObject({ state: 'interview', favorite: true, notes: 'Falar com a Ana', recruiter: 'Ana', processUrl: 'https://ats.example.test/p/1' });
    expect(d.tracking.appliedAt).not.toBeNull();
    expect(d.history.filter((h) => h.field === 'state').map((h) => [h.oldValue, h.newValue])).toEqual([
      ['applied', 'interview'],
      ['new', 'applied'],
    ]);
    // a new capture never touches personal data
    env.database.sqlite.prepare("UPDATE source_state SET last_run_at = NULL").run();
    await env.runner.start({ trigger: 'manual' }).done;
    expect((await detail(id)).tracking.notes).toBe('Falar com a Ana');
  });

  it('filters by favorite, reviewed and state; ignored jobs are hidden by default', async () => {
    await patch(ids[0]!, { favorite: true });
    await patch(ids[1]!, { state: 'reviewed' });
    await patch(ids[2]!, { ignored: true });
    const total = async (qs: string) => (await env.app.inject({ url: `/api/jobs?${qs}` })).json().total;
    expect(await total('favorite=true')).toBe(1);
    expect(await total('reviewed=true')).toBe(1);
    expect(await total('reviewed=false')).toBe(1); // the ignored one is hidden
    expect(await total('state=reviewed')).toBe(1);
    expect(await total('ignored=only')).toBe(1);
    expect(await total('')).toBe(2);
  });

  it('validates input', async () => {
    expect((await patch(ids[0]!, { state: 'hired' })).statusCode).toBe(400);
    expect((await patch(ids[0]!, { processUrl: 'javascript:alert(1)' })).statusCode).toBe(400);
    expect((await patch(ids[0]!, { unknown: 1 })).statusCode).toBe(400);
    expect((await patch(9999, { favorite: true })).statusCode).toBe(404);
  });
});

describe('saved filters', () => {
  it('creates, lists and deletes', async () => {
    const created = await env.app.inject({ method: 'POST', url: '/api/saved-filters', payload: { name: 'React remoto', query: { tech: 'React', remote: 'remote' } } });
    expect(created.statusCode).toBe(201);
    expect((await env.app.inject({ url: '/api/saved-filters' })).json().items).toEqual([expect.objectContaining({ name: 'React remoto', query: { tech: 'React', remote: 'remote' } })]);
    expect((await env.app.inject({ method: 'DELETE', url: `/api/saved-filters/${created.json().id}` })).json()).toEqual({ ok: true });
    expect((await env.app.inject({ url: '/api/saved-filters' })).json().items).toEqual([]);
  });
});

describe('export', () => {
  it('exports CSV respecting filters, escaping and neutralizing formulas', async () => {
    const res = await env.app.inject({ url: '/api/export?format=csv&q=react' });
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="vagas-.*\.csv"/);
    const lines = res.body.replace(/^\uFEFF/, '').trim().split('\r\n');
    expect(lines[0]).toMatch(/^id,titulo,empresa,/);
    expect(lines).toHaveLength(3); // header + 2 React roles
    expect(res.body).toContain('"Co, ""2"""');
    const all = await env.app.inject({ url: '/api/export?format=csv' });
    expect(all.body).toContain(`'=HYPERLINK`);
  });

  it('exports JSON with every match (not one page)', async () => {
    const res = (await env.app.inject({ url: '/api/export?format=json&pageSize=1' })).json();
    expect(res).toMatchObject({ total: 3, exported: 3 });
    expect(res.items[0]).toHaveProperty('primarySource');
  });
});
