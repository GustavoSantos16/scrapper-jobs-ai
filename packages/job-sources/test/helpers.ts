import type { NormalizedJob } from '@ajh/shared';

/** Test-only fixture builder. Never used outside tests. */
export function fakeJob(over: Partial<NormalizedJob> = {}): NormalizedJob {
  return {
    source: 'test',
    sourceJobId: '1',
    title: 'Senior Frontend Engineer',
    company: 'Acme',
    descriptionHtml: null,
    descriptionText: null,
    summary: null,
    url: 'https://example.test/jobs/1',
    canonicalUrl: 'https://example.test/jobs/1',
    atsKey: null,
    country: null,
    region: null,
    city: null,
    locationRaw: null,
    remoteType: 'unknown',
    geoEligibility: [],
    contractTypes: [],
    seniority: 'unknown',
    technologies: [],
    language: null,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryPeriod: null,
    publishedAt: null,
    ...over,
  };
}
