import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '@ajh/database';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { CaptureRunner } from '../src/pipeline/runner.ts';
import { Scheduler } from '../src/scheduler.ts';
import { silentLog } from './helpers.ts';

describe('production web serving', () => {
  it('serves the SPA with a restrictive CSP and falls back to index.html', async () => {
    const dist = mkdtempSync(join(tmpdir(), 'ajh-web-'));
    mkdirSync(join(dist, 'assets'));
    writeFileSync(join(dist, 'index.html'), '<!doctype html><div id="root"></div>');
    writeFileSync(join(dist, 'assets', 'app.js'), 'console.log(1)');
    const database = openDatabase({ path: ':memory:' });
    const runner = new CaptureRunner({ database, connectors: [], env: {}, log: silentLog, loadCompanies: () => [] });
    const scheduler = new Scheduler({ database, runner, log: silentLog, setTimer: () => null, clearTimer: () => undefined });
    const app = await buildApp({ database, runner, scheduler, connectors: [], env: {} }, {}, { webDist: dist });

    const page = await app.inject({ url: '/vagas/123' });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('id="root"');
    const csp = page.headers['content-security-policy'] as string;
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(page.headers['x-content-type-options']).toBe('nosniff');
    expect((await app.inject({ url: '/assets/app.js' })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/nope' })).statusCode).toBe(404);
    await app.close();
    await database.close();
  });
});
