import { describe, expect, it } from 'vitest';
import { createTestEnv } from './helpers.ts';

describe('GET /api/health', () => {
  it('reports ok with the current migration', async () => {
    const env = await createTestEnv({ connectors: [] });
    const res = await env.app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.database.migration).toMatch(/^\d{4}_/);
    await env.close();
  });
});
