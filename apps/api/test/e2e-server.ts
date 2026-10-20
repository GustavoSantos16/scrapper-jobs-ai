// Test-only server for Playwright: temp database, real connectors fed by recorded fixtures
// (no network), built web app served with production headers. Never part of the API bundle.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findRepoRoot, openDatabase } from '@ajh/database';
import { himalayas, jobicy, remoteok } from '@ajh/job-sources';
import { fixtureTransport } from '@ajh/job-sources/testing';
import { buildApp } from '../src/app.ts';
import { CaptureRunner } from '../src/pipeline/runner.ts';
import { Scheduler } from '../src/scheduler.ts';
import { silentLog } from './helpers.ts';

const root = findRepoRoot();
const fx = (n: string) => join(root, 'packages', 'job-sources', 'test', 'fixtures', n);
const port = Number(process.env.E2E_PORT ?? 4399);
const database = openDatabase({ path: join(mkdtempSync(join(tmpdir(), 'ajh-e2e-')), 'e2e.db') });
const connectors = [remoteok, jobicy, himalayas];
const transport = fixtureTransport([
  ['remoteok.com/api', fx('remoteok.json')],
  ['jobicy.com/api', fx('jobicy.json')],
  ['himalayas.app/jobs/api/search', fx('himalayas.json')],
]);
const runner = new CaptureRunner({ database, connectors, env: {}, log: silentLog, loadCompanies: () => [], transport, resolve: async () => ['93.184.215.14'], sleep: async () => undefined });
const scheduler = new Scheduler({ database, runner, log: silentLog });
let companies: { name: string; ats: 'greenhouse' | 'lever' | 'ashby'; slug: string; enabled?: boolean }[] = [];
const app = await buildApp(
  { database, runner, scheduler, connectors, env: {}, loadCompanies: () => companies, saveCompanies: (c) => (companies = c) },
  {},
  { webDist: join(root, 'apps', 'web', 'dist') },
);
await app.listen({ host: '127.0.0.1', port });
process.stdout.write(`e2e server on http://127.0.0.1:${port}\n`);
