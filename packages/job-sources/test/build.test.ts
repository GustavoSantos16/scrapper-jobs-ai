import { NormalizedJob } from '@ajh/shared';
import { describe, expect, it } from 'vitest';
import { buildJob } from '../src/index.ts';

const base = { source: 's', sourceJobId: 1, title: 'Senior Frontend Engineer', url: 'https://x.test/j/1', publishedAt: null };

describe('buildJob', () => {
  it('produces a valid NormalizedJob with derived fields', () => {
    const j = buildJob({
      ...base,
      company: ' Acme  Inc ',
      descriptionHtml: '<p>Remote role. We use React, TypeScript and Node.js.</p><script>x</script>',
      locations: ['Worldwide'],
      contractHints: ['Full-Time'],
      salaryMin: 100000,
      salaryCurrency: 'USD',
      salaryPeriod: 'year',
    });
    expect(NormalizedJob.parse(j)).toBeTruthy();
    expect(j).toMatchObject({
      sourceJobId: '1',
      company: 'Acme Inc',
      remoteType: 'remote',
      seniority: 'senior',
      geoEligibility: ['worldwide'],
      contractTypes: ['full_time'],
      descriptionHtml: '<p>Remote role. We use React, TypeScript and Node.js.</p>',
      canonicalUrl: 'https://x.test/j/1',
    });
    expect(j.technologies).toEqual(expect.arrayContaining(['React', 'TypeScript', 'Node.js']));
  });

  it('a structured country restriction beats regional boilerplate in the text', () => {
    const j = buildJob({ ...base, locations: ['Mexico'], descriptionText: 'This is a 100% remote role from Latin America.' });
    expect(j.geoEligibility).toEqual(['restricted_other']);
  });

  it('an explicit Brazil statement still widens a structured restriction', () => {
    const j = buildJob({ ...base, locations: ['USA'], descriptionText: 'Remote role. Candidates in Brazil are welcome too.' });
    expect(j.geoEligibility).toEqual(['brazil']);
  });

  it('uses text eligibility when there is no structured location', () => {
    const j = buildJob({ ...base, descriptionText: 'Fully remote. We hire engineers across Latin America.' });
    expect(j.geoEligibility).toEqual(['latam']);
  });

  it('tags remote jobs written in Portuguese as Brazil-eligible', () => {
    const j = buildJob({
      ...base,
      title: 'Desenvolvedor Frontend Pleno',
      descriptionText: 'Estamos procurando uma pessoa desenvolvedora para fazer parte do nosso time. Trabalho remoto, com experiência em React e que goste de desafios.',
    });
    expect(j.language).toBe('pt');
    expect(j.geoEligibility).toContain('brazil');
  });

  it('keeps salary currency/period only when an amount exists', () => {
    expect(buildJob({ ...base, salaryCurrency: 'USD', salaryPeriod: 'year' })).toMatchObject({ salaryCurrency: null, salaryPeriod: null });
  });

  it('keeps an unknown publication date as null', () => {
    expect(buildJob(base).publishedAt).toBeNull();
  });
});
