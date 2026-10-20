import { toFtsQuery } from '@ajh/database';
import { buildJob, type AnyConnector, type JobDraft } from '@ajh/job-sources';
import type { JobDetail, JobSummary, Page } from '@ajh/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startOfDay, tzOffsetMinutes } from '../src/lib/time.ts';
import { createTestEnv, type TestEnv } from './helpers.ts';

const NOW = new Date();
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

/** Test-only fixtures: a small, varied set of synthetic jobs. */
const DRAFTS: Omit<JobDraft, 'source' | 'url'>[] = [
  { sourceJobId: 1, title: 'Senior React Engineer', company: 'Acme', descriptionText: 'React, TypeScript. Remote worldwide.', remoteType: 'remote', locations: ['Worldwide'], salaryMin: 120000, salaryMax: 150000, salaryCurrency: 'USD', salaryPeriod: 'year', publishedAt: daysAgo(0.2) },
  { sourceJobId: 2, title: 'Desenvolvedor Angular Pleno', company: 'Brasil Tech', descriptionText: 'Angular e RxJS. Trabalho remoto para todo o Brasil, contratação CLT.', remoteType: 'remote', country: 'BR', publishedAt: daysAgo(2) },
  { sourceJobId: 3, title: 'React Native Developer', company: 'Mobile Co', descriptionText: 'React Native and Expo. US only.', remoteType: 'remote', locations: ['USA'], publishedAt: daysAgo(10) },
  { sourceJobId: 4, title: 'Backend Engineer (Go)', company: 'Zeta', descriptionText: 'Golang microservices, on-site in Berlin.', remoteType: 'onsite', locations: ['Berlin'], publishedAt: null },
  { sourceJobId: 5, title: 'Frontend Engineer', company: 'Acme', descriptionText: 'Vue and TypeScript. Hiring across Latin America.', remoteType: 'remote', publishedAt: daysAgo(0.9) },
];

function seedConnector(id: string, drafts: typeof DRAFTS): AnyConnector {
  return {
    id,
    name: `Seed ${id}`,
    kind: 'official_api',
    homepageUrl: 'https://example.test',
    docsUrl: 'https://example.test',
    attribution: `Vagas via ${id}`,
    description: 'test',
    rateLimit: { minIntervalMinutes: 0, maxRequestsPerRun: 1, minDelayMs: 0 },
    allowedHosts: ['example.test'],
    async *fetchJobs() {
      yield* drafts;
    },
    normalize: (d: (typeof DRAFTS)[number]) => buildJob({ ...d, source: id, url: `https://example.test/${id}/${d.sourceJobId}` }),
  };
}

let env: TestEnv;
const get = async <T>(url: string) => (await env.app.inject({ url })).json() as T;
const titles = (p: Page<JobSummary>) => p.items.map((j) => j.title);

beforeAll(async () => {
  env = await createTestEnv({ connectors: [seedConnector('seed', DRAFTS)] });
  await env.runner.start({ trigger: 'manual' }).done;
});
afterAll(async () => env.close());

describe('GET /api/jobs', () => {
  it('full-text search with prefix and accents', async () => {
    expect(titles(await get('/api/jobs?q=reac'))).toEqual(expect.arrayContaining(['Senior React Engineer', 'React Native Developer']));
    expect(titles(await get('/api/jobs?q=angular rxjs'))).toEqual(['Desenvolvedor Angular Pleno']);
    expect(titles(await get('/api/jobs?q=contratacao'))).toEqual(['Desenvolvedor Angular Pleno']); // diacritics removed
    expect((await get<Page<JobSummary>>('/api/jobs?q="AND OR NOT(*')).total).toBe(0); // operators are neutralized
  });

  it('combines filters', async () => {
    expect(titles(await get('/api/jobs?tech=react&remote=remote'))).toEqual(['Senior React Engineer']);
    expect(titles(await get('/api/jobs?country=BR'))).toEqual(['Desenvolvedor Angular Pleno']);
    expect(titles(await get('/api/jobs?company=acme&sort=title'))).toEqual(['Frontend Engineer', 'Senior React Engineer']);
    expect(titles(await get('/api/jobs?seniority=mid'))).toEqual(['Desenvolvedor Angular Pleno']);
    expect(titles(await get('/api/jobs?contract=clt'))).toEqual(['Desenvolvedor Angular Pleno']);
    expect((await get<Page<JobSummary>>('/api/jobs?eligibleBrazil=true')).total).toBe(3);
    expect((await get<Page<JobSummary>>('/api/jobs?international=true')).total).toBe(4);
    expect(titles(await get('/api/jobs?hasSalary=true&salaryMin=130000&salaryCurrency=USD'))).toEqual(['Senior React Engineer']);
    expect((await get<Page<JobSummary>>('/api/jobs?salaryMin=200000')).total).toBe(0);
    expect(titles(await get('/api/jobs?source=seed&remote=onsite'))).toEqual(['Backend Engineer (Go)']);
  });

  it('filters by publication date and finds unknown dates separately', async () => {
    const from = new Date(NOW.getTime() - 3 * 86_400_000).toISOString();
    expect((await get<Page<JobSummary>>(`/api/jobs?publishedFrom=${encodeURIComponent(from)}`)).total).toBe(3);
    expect(titles(await get('/api/jobs?publishedUnknown=true'))).toEqual(['Backend Engineer (Go)']);
  });

  it('sorts by publication with unknown dates last, both directions', async () => {
    const desc = titles(await get('/api/jobs?sort=published&order=desc'));
    const asc = titles(await get('/api/jobs?sort=published&order=asc'));
    expect(desc[0]).toBe('Senior React Engineer');
    expect(desc.at(-1)).toBe('Backend Engineer (Go)');
    expect(asc[0]).toBe('React Native Developer');
    expect(asc.at(-1)).toBe('Backend Engineer (Go)');
  });

  it('sorts by relevance (profile score) by default', async () => {
    const page = await get<Page<JobSummary>>('/api/jobs');
    const scores = page.items.map((j) => j.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it('paginates on the server', async () => {
    const p1 = await get<Page<JobSummary>>('/api/jobs?pageSize=2&page=1&sort=title');
    const p3 = await get<Page<JobSummary>>('/api/jobs?pageSize=2&page=3&sort=title');
    expect(p1).toMatchObject({ total: 5, page: 1, pageSize: 2 });
    expect(p1.items).toHaveLength(2);
    expect(p3.items).toHaveLength(1);
  });

  it('rejects invalid parameters', async () => {
    expect((await env.app.inject({ url: '/api/jobs?pageSize=1000' })).statusCode).toBe(400);
    expect((await env.app.inject({ url: '/api/jobs?remote=spaceship' })).statusCode).toBe(400);
  });
});

describe('GET /api/jobs/:id', () => {
  it('returns distinct dates, listings with attribution, score reasons and tracking defaults', async () => {
    const id = (await get<Page<JobSummary>>('/api/jobs?q=angular')).items[0]!.id;
    const d = await get<JobDetail>(`/api/jobs/${id}`);
    expect(d.publishedAt).not.toBeNull();
    expect(d.firstSeenAt).not.toBe(d.publishedAt);
    expect(d.listings[0]).toMatchObject({ source: 'seed', sourceName: 'Seed seed', attribution: 'Vagas via seed', isPrimary: true });
    expect(d.scoreBreakdown.length).toBe(9);
    expect(d.tracking).toMatchObject({ state: 'new', favorite: false, notes: '' });
    expect(d.geoEligibility).toContain('brazil');
    expect((await env.app.inject({ url: '/api/jobs/99999' })).statusCode).toBe(404);
  });
});

describe('GET /api/stats and /api/facets', () => {
  it('computes KPIs and chart series', async () => {
    const s = await get<{ kpis: Record<string, number | string | null>; byTech: { key: string }[]; publishedPerDay: unknown[]; timezone: string }>('/api/stats');
    expect(s.kpis).toMatchObject({ total: 5, active: 5, newToday: 5, remote: 4, unreviewed: 5, favorites: 0, sourcesWorking: 1 });
    expect(s.kpis.publishedLast24h).toBe(2);
    expect(s.byTech.map((t) => t.key)).toEqual(expect.arrayContaining(['React', 'TypeScript']));
    expect(s.publishedPerDay.length).toBeGreaterThan(0);
    expect(s.timezone).toBe('America/Sao_Paulo');
    const f = await get<{ technologies: { key: string }[]; sources: { key: string }[] }>('/api/facets');
    expect(f.sources).toEqual([{ key: 'seed', n: 5 }]);
  });
});

describe('FTS query sanitizer', () => {
  it.each([
    ['react native', '"react" "native"*'],
    ['c#', '"c#"*'],
    ['node.js', '"node.js"*'],
    ['"); DROP TABLE jobs; --', '"DROP" "TABLE" "jobs"*'],
    ['   ', null],
    [undefined, null],
  ])('%s → %s', (input, out) => expect(toFtsQuery(input)).toBe(out));
});

describe('time zone helpers', () => {
  it('computes São Paulo offset and local midnight', () => {
    const at = new Date('2026-10-20T02:30:00Z'); // 23:30 on Oct 19 in São Paulo
    expect(tzOffsetMinutes('America/Sao_Paulo', at)).toBe(-180);
    expect(startOfDay('America/Sao_Paulo', at).toISOString()).toBe('2026-10-19T03:00:00.000Z');
    expect(startOfDay('UTC', at).toISOString()).toBe('2026-10-20T00:00:00.000Z');
    expect(startOfDay('America/Sao_Paulo', at, 1).toISOString()).toBe('2026-10-18T03:00:00.000Z');
  });
});
