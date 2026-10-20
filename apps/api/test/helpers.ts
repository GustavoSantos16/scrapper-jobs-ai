import { openDatabase, type Database } from '@ajh/database';
import type { AnyConnector, CompanyConfig, Transport } from '@ajh/job-sources';
import { buildApp } from '../src/app.ts';
import { CaptureRunner } from '../src/pipeline/runner.ts';
import { Scheduler } from '../src/scheduler.ts';

export const silentLog = { debug() {}, info() {}, warn() {}, error() {} };

export interface TestEnv {
  database: Database;
  runner: CaptureRunner;
  scheduler: Scheduler;
  app: Awaited<ReturnType<typeof buildApp>>;
  close(): Promise<void>;
}

/** In-memory database + runner wired to fixture transports. No network. */
export async function createTestEnv(
  opts: {
    connectors: AnyConnector[];
    transport?: Transport;
    env?: Record<string, string | undefined>;
    companies?: CompanyConfig[];
    now?: () => Date;
  },
): Promise<TestEnv> {
  const database = openDatabase({ path: ':memory:' });
  const env = opts.env ?? {};
  let companies: CompanyConfig[] = opts.companies ?? [];
  const runner = new CaptureRunner({
    database,
    connectors: opts.connectors,
    env,
    log: silentLog,
    loadCompanies: () => companies,
    ...(opts.transport && { transport: opts.transport }),
    resolve: async () => ['93.184.215.14'],
    sleep: async () => undefined,
    ...(opts.now && { now: opts.now }),
  });
  const scheduler = new Scheduler({ database, runner, log: silentLog, setTimer: () => null, clearTimer: () => undefined, ...(opts.now && { now: opts.now }) });
  const app = await buildApp({
    database,
    runner,
    scheduler,
    connectors: opts.connectors,
    env,
    loadCompanies: () => companies,
    saveCompanies: (c) => (companies = c),
  });
  return {
    database,
    runner,
    scheduler,
    app,
    async close() {
      scheduler.stop();
      await runner.idle();
      await app.close();
      await database.close();
    },
  };
}
