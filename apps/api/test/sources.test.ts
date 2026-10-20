import { adzuna, greenhouse, HttpClient, remoteok } from '@ajh/job-sources';
import { fixtureTransport } from '@ajh/job-sources/testing';
import type { SourceInfo } from '@ajh/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestEnv, type TestEnv } from './helpers.ts';

const fx = (n: string) => new URL(`../../../packages/job-sources/test/fixtures/${n}`, import.meta.url).pathname;
let env: TestEnv;
afterEach(async () => env?.close());

const sources = async (e: TestEnv) => ((await e.app.inject({ url: '/api/sources' })).json() as { items: SourceInfo[] }).items;
const byId = async (e: TestEnv, id: string) => (await sources(e)).find((s) => s.id === id)!;

describe('GET /api/sources', () => {
  it('reports honest statuses: never run → working only after a real capture', async () => {
    const transport = fixtureTransport([['remoteok.com/api', fx('remoteok.json')]]);
    env = await createTestEnv({ connectors: [remoteok, adzuna, greenhouse], transport });
    expect((await byId(env, 'remoteok')).status).toBe('never_run');
    expect(await byId(env, 'adzuna')).toMatchObject({ status: 'requires_credential', missingEnv: ['ADZUNA_APP_ID', 'ADZUNA_APP_KEY'] });
    expect((await byId(env, 'greenhouse')).statusReason).toMatch(/Nenhuma empresa/);
    await env.runner.start({ trigger: 'manual', sources: ['remoteok'] }).done;
    const ro = await byId(env, 'remoteok');
    expect(ro).toMatchObject({ status: 'working', lastFound: 3, lastNew: 3, activeJobs: 3 });
    expect(ro.nextAllowedAt).not.toBeNull();
  });

  it('shows a failing source with its last error', async () => {
    const transport = fixtureTransport([['remoteok.com/api', 503]]);
    env = await createTestEnv({ connectors: [remoteok], transport });
    await env.runner.start({ trigger: 'manual' }).done;
    expect(await byId(env, 'remoteok')).toMatchObject({ status: 'failing', lastError: 'HTTP 503 from https://remoteok.com/api', consecutiveFailures: 1 });
  });

  it('lists manual-link sources with reasons and profile searches, never as working', async () => {
    env = await createTestEnv({ connectors: [] });
    const manual = (await sources(env)).filter((s) => !s.automated);
    expect(manual.map((m) => m.id)).toEqual(expect.arrayContaining(['linkedin', 'glassdoor', 'indeed', 'wellfound', 'google-jobs', 'yc-workatastartup', 'workday']));
    for (const m of manual) {
      expect(['manual_link', 'unavailable']).toContain(m.status);
      expect(m.statusReason.length).toBeGreaterThan(20);
    }
    expect(manual.find((m) => m.id === 'linkedin')!.searchLinks.length).toBeGreaterThan(0);
  });
});

describe('PATCH /api/sources/:id', () => {
  it('toggles sources and refuses limits looser than the source allows', async () => {
    env = await createTestEnv({ connectors: [remoteok] });
    const off = await env.app.inject({ method: 'PATCH', url: '/api/sources/remoteok', payload: { enabled: false } });
    expect(off.json().status).toBe('disabled');
    const tooFast = await env.app.inject({ method: 'PATCH', url: '/api/sources/remoteok', payload: { minIntervalMinutes: 5 } });
    expect(tooFast.statusCode).toBe(400);
    const tooMany = await env.app.inject({ method: 'PATCH', url: '/api/sources/remoteok', payload: { maxRequests: 50 } });
    expect(tooMany.statusCode).toBe(400);
    const slower = await env.app.inject({ method: 'PATCH', url: '/api/sources/remoteok', payload: { minIntervalMinutes: 240, enabled: true } });
    expect(slower.json()).toMatchObject({ effectiveIntervalMinutes: 240, enabled: true });
    expect((await env.app.inject({ method: 'PATCH', url: '/api/sources/linkedin', payload: { enabled: true } })).statusCode).toBe(404);
  });
});

describe('companies API', () => {
  it('validates, saves and rejects duplicates', async () => {
    env = await createTestEnv({ connectors: [greenhouse] });
    const bad = await env.app.inject({ method: 'PUT', url: '/api/companies', payload: { companies: [{ name: 'X', ats: 'greenhouse', slug: '../etc' }] } });
    expect(bad.statusCode).toBe(400);
    const dup = await env.app.inject({
      method: 'PUT',
      url: '/api/companies',
      payload: { companies: [{ name: 'A', ats: 'lever', slug: 'a' }, { name: 'A2', ats: 'lever', slug: 'A' }] },
    });
    expect(dup.statusCode).toBe(400);
    const ok = await env.app.inject({ method: 'PUT', url: '/api/companies', payload: { companies: [{ name: 'VTEX', ats: 'greenhouse', slug: 'vtex' }] } });
    expect(ok.json().items).toEqual([{ name: 'VTEX', ats: 'greenhouse', slug: 'vtex', enabled: true }]);
    expect((await env.app.inject({ url: '/api/companies' })).json().items).toHaveLength(1);
    expect((await byId(env, 'greenhouse')).companiesCount).toBe(1);
  });

  it('checks a board through the guarded HTTP client', async () => {
    const transport = fixtureTransport([['boards/vtex/jobs', fx('greenhouse.json')]]);
    env = await createTestEnv({ connectors: [] });
    env.app.deps.httpFactory = (hosts) => new HttpClient({ allowedHosts: hosts, transport, resolve: async () => ['93.184.215.14'], minDelayMs: 0 });
    const ok = await env.app.inject({ method: 'POST', url: '/api/companies/validate', payload: { ats: 'greenhouse', slug: 'vtex' } });
    expect(ok.json()).toEqual({ ok: true, jobs: 2 });
    const missing = await env.app.inject({ method: 'POST', url: '/api/companies/validate', payload: { ats: 'greenhouse', slug: 'nope' } });
    expect(missing.json()).toMatchObject({ ok: false, message: 'Board não encontrado (HTTP 404)' });
  });
});
