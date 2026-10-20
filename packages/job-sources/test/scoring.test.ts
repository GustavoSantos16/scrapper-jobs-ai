import { DEFAULT_PROFILE, type Profile } from '@ajh/shared';
import { describe, expect, it } from 'vitest';
import { scoreJob } from '../src/index.ts';
import { fakeJob } from './helpers.ts';

const NOW = new Date('2026-10-20T12:00:00Z');
const points = (r: ReturnType<typeof scoreJob>, key: string) => r.breakdown.find((b) => b.key === key)!.points;

describe('scoreJob', () => {
  it('gives a high score to a job that matches the whole profile', () => {
    const r = scoreJob(
      fakeJob({
        title: 'Senior React Engineer',
        descriptionText: 'React, TypeScript, Node.js, REST APIs and Firebase.',
        technologies: ['React', 'TypeScript', 'Node.js', 'REST', 'Firebase'],
        remoteType: 'remote',
        geoEligibility: ['latam'],
        contractTypes: ['contractor'],
        seniority: 'senior',
        publishedAt: '2026-10-20T08:00:00Z',
        salaryMin: 5000,
        salaryCurrency: 'USD',
      }),
      DEFAULT_PROFILE,
      NOW,
    );
    expect(r.score).toBe(100);
    expect(r.breakdown).toHaveLength(9);
  });

  it('is neutral (not zero) when information is missing', () => {
    const r = scoreJob(fakeJob({ title: 'Frontend Engineer' }), DEFAULT_PROFILE, NOW);
    expect(points(r, 'geo')).toBe(7.5);
    expect(points(r, 'remote')).toBe(7.5);
    expect(points(r, 'recency')).toBe(2.5);
    expect(points(r, 'salary')).toBe(1.5);
    expect(r.breakdown.find((b) => b.key === 'recency')!.reason).toMatch(/desconhecida/);
    expect(r.score).toBeGreaterThan(40);
  });

  it('penalizes explicit geographic restrictions', () => {
    const base = fakeJob({ title: 'Senior React Engineer', remoteType: 'remote' });
    const open = scoreJob(base, DEFAULT_PROFILE, NOW);
    const usOnly = scoreJob({ ...base, geoEligibility: ['us_only'] }, DEFAULT_PROFILE, NOW);
    expect(points(usOnly, 'geo')).toBe(-15);
    expect(usOnly.score).toBeLessThan(open.score);
    expect(usOnly.breakdown.find((b) => b.key === 'geo')!.reason).toBe('Restrita a EUA');
  });

  it('counts eligibility when any tag is accepted', () => {
    const r = scoreJob(fakeJob({ geoEligibility: ['us_only', 'latam'] }), DEFAULT_PROFILE, NOW);
    expect(points(r, 'geo')).toBe(15);
  });

  it('penalizes onsite and internships', () => {
    const r = scoreJob(fakeJob({ remoteType: 'onsite', seniority: 'intern' }), DEFAULT_PROFILE, NOW);
    expect(points(r, 'remote')).toBeLessThan(0);
    expect(points(r, 'seniority')).toBeLessThan(0);
  });

  it('decays recency with age', () => {
    const p = (d: string) => points(scoreJob(fakeJob({ publishedAt: d }), DEFAULT_PROFILE, NOW), 'recency');
    expect(p('2026-10-20T00:00:00Z')).toBe(5);
    expect(p('2026-10-15T00:00:00Z')).toBe(3.5);
    expect(p('2026-08-01T00:00:00Z')).toBe(0);
  });

  it('treats generic titles as partial matches', () => {
    expect(points(scoreJob(fakeJob({ title: 'Software Engineer' }), DEFAULT_PROFILE, NOW), 'title')).toBe(12);
    expect(points(scoreJob(fakeJob({ title: 'Data Analyst' }), DEFAULT_PROFILE, NOW), 'title')).toBe(0);
  });

  it('respects custom weights and keeps 0–100', () => {
    const profile: Profile = {
      ...DEFAULT_PROFILE,
      weights: { ...DEFAULT_PROFILE.weights, geo: 0, salary: 50 },
    };
    const r = scoreJob(fakeJob({ salaryMin: 1, geoEligibility: ['us_only'] }), profile, NOW);
    expect(points(r, 'geo')).toBe(0);
    expect(r.breakdown.find((b) => b.key === 'salary')!.max).toBeCloseTo((50 / 132) * 100, 0);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it('never goes below zero', () => {
    const r = scoreJob(
      fakeJob({ title: 'Nurse', descriptionText: 'Hospital work', remoteType: 'onsite', geoEligibility: ['us_only'], seniority: 'intern', contractTypes: ['temporary'], publishedAt: '2025-01-01T00:00:00Z' }),
      DEFAULT_PROFILE,
      NOW,
    );
    expect(r.score).toBe(0);
  });

  it('matches profile terms the dictionary does not know', () => {
    const profile = { ...DEFAULT_PROFILE, primaryTech: ['Qwik', 'SolidJS'] };
    const r = scoreJob(fakeJob({ descriptionText: 'We use Qwik and SolidJS' }), profile, NOW);
    expect(points(r, 'primaryTech')).toBe(25);
  });
});
