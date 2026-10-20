import { NormalizedJob } from '@ajh/shared';
import { describe, expect, it } from 'vitest';
import { himalayas, jobicy, remoteok } from '../src/index.ts';
import { collect, fixtureContext, fixtureTransport } from '../src/testing.ts';
import { fx } from './fixtures.ts';

const NOW = { now: new Date('2026-10-20T21:00:00Z') };

describe('jobicy connector (recorded fixture)', () => {
  const transport = fixtureTransport([['jobicy.com/api/v2/remote-jobs', fx('jobicy.json')]]);
  it('fetches every configured query and normalizes valid jobs', async () => {
    const raws = await collect(jobicy.fetchJobs(fixtureContext(jobicy, transport)));
    expect(transport.calls).toHaveLength(3);
    expect(raws).toHaveLength(9); // 3 fixture jobs × 3 queries; dedup happens later
    const jobs = raws.map((r) => jobicy.normalize(r, NOW)!);
    for (const j of jobs) expect(NormalizedJob.safeParse(j).success).toBe(true);
    const first = jobs[0]!;
    expect(first).toMatchObject({
      source: 'jobicy',
      sourceJobId: '156024',
      company: 'Truelogic',
      remoteType: 'remote',
      seniority: 'senior',
      publishedAt: '2026-10-20T15:27:06.000Z',
    });
    expect(first.geoEligibility).toContain('brazil');
    expect(first.contractTypes).toContain('full_time');
    const paid = jobs.find((j) => j.salaryMin)!;
    expect(paid).toMatchObject({ salaryCurrency: 'USD', salaryPeriod: 'year' });
  });
});

describe('remoteok connector (recorded fixture)', () => {
  const transport = fixtureTransport([['remoteok.com/api', fx('remoteok.json')]]);
  it('skips the legal notice and treats 0 salary as unknown', async () => {
    const raws = await collect(remoteok.fetchJobs(fixtureContext(remoteok, transport)));
    expect(raws).toHaveLength(3);
    const jobs = raws.map((r) => remoteok.normalize(r, NOW)!);
    for (const j of jobs) expect(NormalizedJob.safeParse(j).success).toBe(true);
    expect(jobs[0]!.salaryMin).toBeNull();
    expect(jobs[0]!.url).toMatch(/^https:\/\/remoteok\.com\//);
    expect(jobs[0]!.publishedAt).toBe('2026-10-19T16:00:04.000Z');
    expect(jobs.slice(1).every((j) => j.salaryMin! > 0 && j.salaryCurrency === 'USD')).toBe(true);
  });
});

describe('himalayas connector (recorded fixture)', () => {
  const transport = fixtureTransport([['himalayas.app/jobs/api/search', fx('himalayas.json')]]);
  it('searches by profile terms and converts epoch dates', async () => {
    const ctx = fixtureContext(himalayas, transport);
    const raws = await collect(himalayas.fetchJobs(ctx));
    expect(transport.calls).toHaveLength(6);
    expect(transport.calls[0]).toContain('q=react');
    const jobs = raws.slice(0, 3).map((r) => himalayas.normalize(r, NOW)!);
    for (const j of jobs) {
      expect(NormalizedJob.safeParse(j).success).toBe(true);
      expect(j.publishedAt).toMatch(/^2026-/);
      expect(j.remoteType).toBe('remote');
    }
  });

  it('applies the Himalayas timezone rule for eligibility', () => {
    const base = { guid: 'https://himalayas.app/companies/a/jobs/b', title: 'Senior React Engineer', pubDate: 1792524067 };
    expect(himalayas.normalize({ ...base, timezoneRestrictions: [-3, -5] }, NOW)!.geoEligibility).toContain('worldwide');
    expect(himalayas.normalize({ ...base, timezoneRestrictions: [8] }, NOW)!.geoEligibility).toEqual(['restricted_other']);
    expect(himalayas.normalize({ ...base, locationRestrictions: ['United States'] }, NOW)!.geoEligibility).toEqual(['us_only']);
  });
});

describe('request budget', () => {
  it('stops a connector that exceeds its per-run request cap', async () => {
    const transport = fixtureTransport([['jobicy.com', fx('jobicy.json')]]);
    const ctx = fixtureContext({ ...jobicy, rateLimit: { ...jobicy.rateLimit, maxRequestsPerRun: 1 } }, transport);
    await expect(collect(jobicy.fetchJobs(ctx))).rejects.toThrow(/budget/);
  });
});
