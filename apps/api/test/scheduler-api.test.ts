import { afterEach, describe, expect, it } from 'vitest';
import { createTestEnv, type TestEnv } from './helpers.ts';

let env: TestEnv;
afterEach(async () => env?.close());

describe('scheduler and settings API', () => {
  it('reads and updates the schedule', async () => {
    env = await createTestEnv({ connectors: [] });
    expect((await env.app.inject({ url: '/api/scheduler' })).json()).toMatchObject({ interval: 'manual', paused: false, nextRunAt: null, running: false });
    const res = await env.app.inject({ method: 'PUT', url: '/api/scheduler', payload: { interval: '3h', paused: false } });
    expect(res.json().nextRunAt).not.toBeNull();
    expect((await env.app.inject({ method: 'PUT', url: '/api/scheduler', payload: { interval: '5m', paused: false } })).statusCode).toBe(400);
  });

  it('validates and saves profile, pipeline and display settings', async () => {
    env = await createTestEnv({ connectors: [] });
    const all = (await env.app.inject({ url: '/api/settings' })).json();
    expect(all.display.timezone).toBe('America/Sao_Paulo');
    expect(all.pipeline.retentionDays).toBeNull(); // retention off by default
    const p = await env.app.inject({ method: 'PUT', url: '/api/settings/profile', payload: { ...all.profile, primaryTech: ['Vue'] } });
    expect(p.statusCode).toBe(200);
    expect((await env.app.inject({ url: '/api/settings' })).json().profile.primaryTech).toEqual(['Vue']);
    expect((await env.app.inject({ method: 'PUT', url: '/api/settings/display', payload: { timezone: 'Mars/Olympus' } })).statusCode).toBe(400);
    expect((await env.app.inject({ method: 'PUT', url: '/api/settings/display', payload: { timezone: 'Europe/Lisbon' } })).statusCode).toBe(200);
    expect((await env.app.inject({ method: 'PUT', url: '/api/settings/pipeline', payload: { ...all.pipeline, concurrency: 99 } })).statusCode).toBe(400);
  });
});
