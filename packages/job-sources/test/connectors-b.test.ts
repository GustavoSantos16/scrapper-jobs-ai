import { DEFAULT_PROFILE, NormalizedJob } from '@ajh/shared';
import { describe, expect, it } from 'vitest';
import {
  adzuna,
  arbeitnow,
  ashby,
  CONNECTORS,
  greenhouse,
  hnJobs,
  hnWhoIsHiring,
  jooble,
  lever,
  MANUAL_SOURCES,
  parseHiringComment,
  parseJobStoryTitle,
  remotive,
  weworkremotely,
  type AnyConnector,
  type CompanyConfig,
} from '../src/index.ts';
import { collect, fixtureContext, fixtureTransport } from '../src/testing.ts';
import { fx } from './fixtures.ts';

const NOW = { now: new Date('2026-10-20T21:00:00Z') };

async function run(connector: AnyConnector, routes: Parameters<typeof fixtureTransport>[0], over: Parameters<typeof fixtureContext>[2] = {}) {
  const transport = fixtureTransport(routes);
  const raws = await collect(connector.fetchJobs(fixtureContext(connector, transport, over)));
  const jobs = raws.map((r) => connector.normalize(r, NOW)).filter((j): j is NormalizedJob => j !== null);
  for (const j of jobs) {
    const parsed = NormalizedJob.safeParse(j);
    if (!parsed.success) throw new Error(`${connector.id}: ${JSON.stringify(parsed.error.issues)}`);
  }
  return { transport, raws, jobs };
}

describe('registry', () => {
  it('has unique ids and complete metadata', () => {
    const ids = CONNECTORS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CONNECTORS) {
      expect(c.allowedHosts.length).toBeGreaterThan(0);
      expect(c.rateLimit.minIntervalMinutes).toBeGreaterThanOrEqual(60);
      expect(c.docsUrl).toMatch(/^https:\/\//);
    }
  });
  it('manual sources explain why and build profile searches', () => {
    for (const m of MANUAL_SOURCES) {
      expect(m.reason.length).toBeGreaterThan(20);
      for (const l of m.searchLinks(DEFAULT_PROFILE)) expect(l.url).toMatch(/^https:\/\//);
    }
    const li = MANUAL_SOURCES.find((m) => m.id === 'linkedin')!.searchLinks(DEFAULT_PROFILE);
    expect(li[0]!.url).toContain('keywords=React');
    expect(li[0]!.url).toContain('f_WT=2');
  });
});

describe('remotive', () => {
  it('runs 4 queries and parses free-text salaries', async () => {
    const { transport, jobs } = await run(remotive, [['remotive.com/api/remote-jobs', fx('remotive.json')]]);
    expect(transport.calls).toHaveLength(4);
    const first = jobs[0]!;
    expect(first).toMatchObject({ source: 'remotive', company: 'Askable', remoteType: 'remote', publishedAt: '2026-10-17T16:04:29.000Z' });
    expect(first.geoEligibility).toEqual(['worldwide']);
    expect(first).toMatchObject({ salaryMin: 1000, salaryCurrency: 'USD', salaryPeriod: 'task' });
    expect(first.contractTypes).toContain('contractor');
  });
});

describe('arbeitnow', () => {
  it('keeps only remote jobs and stops when there is no next page', async () => {
    const { transport, raws, jobs } = await run(arbeitnow, [['arbeitnow.com/api/job-board-api', fx('arbeitnow.json')]]);
    expect(transport.calls).toHaveLength(1);
    expect(raws.every((r: { remote: boolean }) => r.remote)).toBe(true);
    expect(jobs).toHaveLength(3);
    expect(jobs.every((j) => j.publishedAt?.startsWith('2026-'))).toBe(true);
  });
});

describe('weworkremotely', () => {
  it('parses RSS items, "Company: Role" titles and RFC 2822 dates', async () => {
    const { transport, jobs } = await run(weworkremotely, [['weworkremotely.com/categories', fx('weworkremotely.xml')]]);
    expect(transport.calls).toHaveLength(3);
    const j = jobs[0]!;
    expect(j).toMatchObject({ company: 'Current', title: 'Freelance Marketo Email Engineer', publishedAt: '2026-10-19T07:31:25.000Z', remoteType: 'remote' });
    expect(j.geoEligibility).toEqual(['worldwide']); // "Anywhere in the World"
    expect(j.descriptionHtml).not.toMatch(/&lt;|<script/);
  });
});

describe('hn who is hiring', () => {
  it('finds the monthly thread and keeps only top-level job comments', async () => {
    const { transport, raws, jobs } = await run(hnWhoIsHiring, [
      ['search_by_date', fx('hn-stories.json')],
      ['tags=comment', fx('hn-comments.json')],
    ]);
    expect(transport.calls[1]).toContain('story_49922569');
    expect(raws.every((c: { parent_id: number }) => c.parent_id === 49922569)).toBe(true);
    expect(jobs.length).toBeGreaterThan(0);
    for (const j of jobs) {
      expect(j.url).toMatch(/^https:\/\/news\.ycombinator\.com\/item\?id=\d+$/);
      expect(j.publishedAt).toMatch(/^2026-10-/);
    }
  });

  it('parses the conventional first line', () => {
    expect(parseHiringComment('Treat Health | Full-stack Engineer (Elixir, React) | Helsinki, Finland | ONSITE | Full-time<p>…')).toEqual({
      company: 'Treat Health',
      title: 'Full-stack Engineer (Elixir, React)',
      location: 'Helsinki, Finland',
      headline: 'Treat Health | Full-stack Engineer (Elixir, React) | Helsinki, Finland | ONSITE | Full-time',
    });
    expect(parseHiringComment('Is anyone hiring juniors this month?')).toBeNull();
  });
});

describe('hn jobs (YC)', () => {
  it('fetches job stories and parses YC titles', async () => {
    const { transport, jobs } = await run(hnJobs, [
      ['jobstories.json', fx('hn-jobstories.json')],
      ['item/50164991', fx('hn-item-50164991.json')],
      ['item/50155172', fx('hn-item-50155172.json')],
    ]);
    expect(transport.calls).toHaveLength(3);
    expect(jobs[0]).toMatchObject({ company: 'Hazel', url: 'https://www.ycombinator.com/companies/hazel-2/jobs/PpNKYBS-full-stack-engineer-ts-sci' });
    expect(jobs[0]!.publishedAt).toBe('2026-10-20T12:00:32.000Z');
  });
  it.each([
    ['Hazel (YC W24) Is Hiring', { company: 'Hazel', title: 'Hazel (YC W24) Is Hiring' }],
    ['Acme (YC S21) is hiring a Senior Frontend Engineer', { company: 'Acme', title: 'Senior Frontend Engineer' }],
    ['Foo Is Hiring Remote React Engineers', { company: 'Foo', title: 'Remote React Engineers' }],
  ])('%s', (t, expected) => expect(parseJobStoryTitle(t)).toEqual(expected));
});

const companies: CompanyConfig[] = [
  { name: 'VTEX', ats: 'greenhouse', slug: 'vtex' },
  { name: 'Broken', ats: 'greenhouse', slug: 'does-not-exist' },
  { name: 'CI&T', ats: 'lever', slug: 'ciandt' },
  { name: 'Supabase', ats: 'ashby', slug: 'supabase' },
  { name: 'Disabled', ats: 'ashby', slug: 'off', enabled: false },
];

describe('greenhouse', () => {
  it('reads every configured board, skips broken slugs and decodes escaped HTML', async () => {
    const { transport, jobs } = await run(greenhouse, [['boards/vtex/jobs', fx('greenhouse.json')]], { companies });
    expect(transport.calls).toHaveLength(2); // vtex + broken (404, skipped)
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({ company: 'VTEX', publishedAt: '2026-10-06T12:59:45.000Z', atsKey: 'greenhouse:6218060004', seniority: 'mid' });
    expect(jobs[0]!.descriptionHtml).toMatch(/^<p>/);
    expect(jobs[0]!.geoEligibility).toContain('brazil');
  });
  it('fails when every board fails', async () => {
    await expect(run(greenhouse, [], { companies: [companies[1]!] })).rejects.toThrow(/All greenhouse boards failed/);
  });
});

describe('lever', () => {
  it('maps workplace type, country and createdAt', async () => {
    const { jobs } = await run(lever, [['postings/ciandt', fx('lever.json')]], { companies });
    expect(jobs[0]).toMatchObject({ company: 'CI&T', country: 'BR', remoteType: 'remote', atsKey: 'lever:201a7aec-f1e0-4e46-af6a-18a9eaf3769c' });
    expect(jobs[0]!.publishedAt).toBe('2026-09-30T14:41:14.622Z');
  });
});

describe('ashby', () => {
  it('reads listed jobs of enabled companies only', async () => {
    const { transport, jobs } = await run(ashby, [['job-board/supabase', fx('ashby.json')]], { companies });
    expect(transport.calls).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ company: 'Supabase', contractTypes: ['full_time'], publishedAt: '2026-07-31T18:56:39.246Z' });
    expect(jobs[0]!.geoEligibility).toContain('worldwide'); // "Remote, Global"
  });
});

describe('adzuna (requires credential)', () => {
  it('uses the keys from env and ignores predicted salaries', async () => {
    const env = { ADZUNA_APP_ID: 'id123', ADZUNA_APP_KEY: 'key456' };
    const { transport, jobs } = await run(adzuna, [['api.adzuna.com/v1/api/jobs/br/search/1', fx('adzuna.json')]], { env });
    expect(transport.calls[0]).toContain('app_id=id123');
    expect(jobs[0]).toMatchObject({ salaryMin: 96000, salaryMax: 120000, salaryCurrency: 'BRL', publishedAt: '2026-10-19T12:00:00.000Z' });
    expect(jobs[1]).toMatchObject({ salaryMin: null, salaryCurrency: null });
    expect(jobs[0]!.canonicalUrl).not.toContain('utm_');
  });
});

describe('jooble (requires credential)', () => {
  it('posts the search and keeps publishedAt unknown', async () => {
    const { transport, jobs } = await run(jooble, [['jooble.org/api/', fx('jooble.json')]], { env: { JOOBLE_API_KEY: 'k' } });
    expect(transport.calls).toHaveLength(3);
    expect(jobs[0]).toMatchObject({ publishedAt: null, salaryMin: 9000, salaryMax: 12000, salaryCurrency: 'BRL', salaryPeriod: 'month' });
    expect(jobs[0]!.technologies).toEqual(expect.arrayContaining(['React Native', 'Expo']));
  });
});
