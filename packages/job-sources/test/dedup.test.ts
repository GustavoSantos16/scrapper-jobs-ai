import { describe, expect, it } from 'vitest';
import {
  AUTO_MERGE_THRESHOLD,
  decideMatch,
  identityHash,
  normalizeCompany,
  normalizeTitle,
  similarity,
  type DedupCandidate,
} from '../src/index.ts';
import { fakeJob } from './helpers.ts';

const DESC = `We are hiring a senior frontend engineer to build our design system with React and TypeScript.
You will work closely with product designers, own accessibility, performance budgets and testing, mentor other engineers,
and help shape the architecture of our web and mobile apps. We offer fully remote work across Latin America,
flexible hours, a home office budget and paid time off. Our stack includes Next.js, GraphQL, Node.js and PostgreSQL.`;

function candidate(over: Partial<DedupCandidate> = {}): DedupCandidate {
  return {
    jobId: 10,
    sources: ['remotive'],
    canonicalUrls: ['https://remotive.com/remote-jobs/x-1'],
    atsKeys: [],
    identityHash: null,
    companyNormalized: 'acme',
    title: 'Senior Frontend Engineer',
    descriptionText: DESC,
    ...over,
  };
}

function incoming(over: Parameters<typeof fakeJob>[0] = {}) {
  const j = fakeJob({ source: 'jobicy', descriptionText: DESC, ...over });
  return { ...j, identityHash: identityHash(j) };
}

describe('normalization for dedup', () => {
  it('normalizes company names', () => {
    expect(normalizeCompany('Acme, Inc.')).toBe('acme');
    expect(normalizeCompany('ACME LTDA')).toBe('acme');
    expect(normalizeCompany('Ação Tecnologia S.A.')).toBe('acao tecnologia');
    expect(normalizeCompany('CI&T')).toBe('ci and t');
    expect(normalizeCompany('')).toBeNull();
  });
  it('normalizes titles', () => {
    expect(normalizeTitle('Sr. Front-End Engineer (Remote)')).toBe('senior frontend engineer');
    expect(normalizeTitle('Senior Frontend Engineer - Remote, LATAM')).toBe('senior frontend engineer');
    expect(normalizeTitle('Entwickler (m/w/d)')).toBe('entwickler');
  });
  it('identity hash ignores formatting differences', () => {
    const a = identityHash(fakeJob({ company: 'Acme Inc.', title: 'Sr. Front-End Engineer', remoteType: 'remote' }));
    const b = identityHash(fakeJob({ company: 'ACME', title: 'Senior Frontend Engineer (Remote)', remoteType: 'remote' }));
    expect(a).toBe(b);
    expect(identityHash(fakeJob({ company: null }))).toBeNull();
  });
  it('identity hash separates locations', () => {
    const a = identityHash(fakeJob({ remoteType: 'onsite', country: 'BR' }));
    const b = identityHash(fakeJob({ remoteType: 'onsite', country: 'MX' }));
    expect(a).not.toBe(b);
  });
});

describe('similarity', () => {
  it('is 1 for identical title and description', () => {
    expect(similarity({ title: 'A b c', descriptionText: DESC }, { title: 'A b c', descriptionText: DESC }).score).toBe(1);
  });
  it('is title-only when a description is missing', () => {
    const s = similarity({ title: 'Senior Frontend Engineer', descriptionText: null }, { title: 'Senior Frontend Engineer', descriptionText: DESC });
    expect(s.description).toBeNull();
  });
});

describe('decideMatch (layers 2–5)', () => {
  it('layer 2: merges on equal canonical URL', () => {
    const d = decideMatch(incoming({ canonicalUrl: 'https://remotive.com/remote-jobs/x-1' }), [candidate()]);
    expect(d).toEqual({ action: 'merge', jobId: 10, method: 'url', confidence: 1 });
  });

  it('layer 3: merges on the same ATS posting id', () => {
    const d = decideMatch(incoming({ atsKey: 'greenhouse:123' }), [candidate({ atsKeys: ['greenhouse:123'] })]);
    expect(d).toMatchObject({ action: 'merge', method: 'ats_id' });
  });

  it('layer 4: merges on identity hash from another source', () => {
    const inc = incoming({ remoteType: 'remote' });
    const d = decideMatch(inc, [candidate({ identityHash: inc.identityHash, descriptionText: null })]);
    expect(d).toMatchObject({ action: 'merge', method: 'identity', confidence: 0.95 });
  });

  it('layer 4: never merges two listings of the same source on identity', () => {
    const inc = incoming({ source: 'greenhouse', remoteType: 'remote' });
    const d = decideMatch(inc, [candidate({ sources: ['greenhouse'], identityHash: inc.identityHash })]);
    expect(d.action).toBe('new');
  });

  it('layer 5: merges near-identical descriptions above the high threshold', () => {
    const d = decideMatch(
      incoming({ title: 'Senior Front-end Engineer (LATAM)', descriptionText: `${DESC} Apply now!` }),
      [candidate({ title: 'Sr Frontend Engineer' })],
    );
    expect(d).toMatchObject({ action: 'merge', method: 'similarity' });
    if (d.action === 'merge') expect(d.confidence).toBeGreaterThanOrEqual(AUTO_MERGE_THRESHOLD);
  });

  it('never merges on similar titles alone: sends to review', () => {
    const d = decideMatch(incoming({ title: 'Senior Frontend Engineer', descriptionText: null }), [candidate()]);
    expect(d.action).toBe('new');
    if (d.action === 'new') expect(d.reviews).toEqual([{ jobId: 10, confidence: 1, method: 'similarity' }]);
  });

  it('does not merge same title with a different description', () => {
    const other = 'Join our payments team to build checkout experiences for millions of merchants with Angular, RxJS and NgRx. '.repeat(3);
    const d = decideMatch(incoming({ descriptionText: other }), [candidate()]);
    expect(d.action).toBe('new');
  });

  it('does not queue different roles that only share company boilerplate', () => {
    const d = decideMatch(incoming({ title: 'Forward Deployed Engineer - Software Engineering' }), [candidate({ title: 'Mobile Engineer - ElevenMusic' })]);
    expect(d).toEqual({ action: 'new', reviews: [] });
  });

  it('never compares across companies', () => {
    const d = decideMatch(incoming({ company: 'Globex' }), [candidate()]);
    expect(d).toEqual({ action: 'new', reviews: [] });
  });

  it('stops at the first certain layer (URL beats ATS)', () => {
    const d = decideMatch(incoming({ canonicalUrl: 'https://remotive.com/remote-jobs/x-1', atsKey: 'lever:abc' }), [
      candidate({ jobId: 1, atsKeys: ['lever:abc'], canonicalUrls: [] }),
      candidate({ jobId: 2 }),
    ]);
    expect(d).toMatchObject({ action: 'merge', jobId: 2, method: 'url' });
  });
});
