import { buildJob, type AnyConnector } from '@ajh/job-sources';
import type { JobDetail } from '@ajh/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestEnv, type TestEnv } from './helpers.ts';

/** Two test-only sources posting the same role without description: a doubtful duplicate. */
function source(id: string, title: string): AnyConnector {
  return {
    id,
    name: id,
    kind: 'official_api',
    homepageUrl: 'https://example.test',
    docsUrl: 'https://example.test',
    attribution: id,
    description: 'test',
    rateLimit: { minIntervalMinutes: 0, maxRequestsPerRun: 1, minDelayMs: 0 },
    allowedHosts: ['example.test'],
    async *fetchJobs() {
      yield { id: 1 };
    },
    normalize: () => buildJob({ source: id, sourceJobId: 1, title, company: 'Acme', url: `https://example.test/${id}/1`, publishedAt: null }),
  };
}

let env: TestEnv;
afterEach(async () => env?.close());

describe('dedup review queue', () => {
  it('queues a doubtful pair across sources and merges it on request', async () => {
    env = await createTestEnv({ connectors: [source('a', 'Senior Frontend Engineer'), source('b', 'Senior Frontend Engineer - Payments')] });
    await env.runner.start({ trigger: 'manual' }).done;
    const list = (await env.app.inject({ url: '/api/reviews' })).json();
    expect(list.total).toBe(1);
    const review = list.items[0];
    expect(review.a.title).toBe('Senior Frontend Engineer');
    expect(review.b.title).toBe('Senior Frontend Engineer - Payments');

    const merged = (await env.app.inject({ method: 'POST', url: `/api/reviews/${review.id}`, payload: { action: 'merge' } })).json();
    expect(merged.ok).toBe(true);
    const detail = (await env.app.inject({ url: `/api/jobs/${merged.keptJobId}` })).json() as JobDetail;
    expect(detail.listings.map((l) => [l.source, l.matchMethod])).toEqual([
      ['a', 'primary'],
      ['b', 'manual'],
    ]);
    expect((await env.app.inject({ url: '/api/jobs' })).json().total).toBe(1);
    expect((await env.app.inject({ method: 'POST', url: `/api/reviews/${review.id}`, payload: { action: 'merge' } })).statusCode).toBe(409);
    // the decision is kept as history even though the absorbed job was deleted
    const history = (await env.app.inject({ url: '/api/reviews?status=merged' })).json();
    expect(history.items[0]).toMatchObject({ keptJobId: merged.keptJobId, mergedTitle: 'Senior Frontend Engineer - Payments', b: null });
  });

  it('dismisses a pair and keeps both jobs', async () => {
    env = await createTestEnv({ connectors: [source('a', 'Senior Frontend Engineer'), source('b', 'Senior Frontend Engineer - Payments')] });
    await env.runner.start({ trigger: 'manual' }).done;
    const id = (await env.app.inject({ url: '/api/reviews' })).json().items[0].id;
    await env.app.inject({ method: 'POST', url: `/api/reviews/${id}`, payload: { action: 'dismiss' } });
    expect((await env.app.inject({ url: '/api/reviews' })).json().total).toBe(0);
    expect((await env.app.inject({ url: '/api/reviews?status=dismissed' })).json().total).toBe(1);
    expect((await env.app.inject({ url: '/api/jobs' })).json().total).toBe(2);
  });
});
