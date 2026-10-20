import { openDatabase } from '@ajh/database';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';

describe('GET /api/health', () => {
  const database = openDatabase({ path: ':memory:' });
  afterEach(() => undefined);

  it('reports ok with the current migration', async () => {
    const app = await buildApp({ database });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.database.migration).toMatch(/^0001_/);
    await app.close();
  });
});
