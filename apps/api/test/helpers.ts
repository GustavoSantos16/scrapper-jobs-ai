import { openDatabase, type Database } from '@ajh/database';
import type { AnyConnector, CompanyConfig, Transport } from '@ajh/job-sources';
import { buildApp } from '../src/app.ts';
import { CaptureRunner } from '../src/pipeline/runner.ts';

export const silentLog = { debug() {}, info() {}, warn() {}, error() {} };

export interface TestEnv {
  database: Database;
  runner: CaptureRunner;
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
  const runner = new CaptureRunner({
    database,
    connectors: opts.connectors,
    env,
    log: silentLog,
    loadCompanies: () => opts.companies ?? [],
    ...(opts.transport && { transport: opts.transport }),
    resolve: async () => ['93.184.215.14'],
    sleep: async () => undefined,
    ...(opts.now && { now: opts.now }),
  });
  const app = await buildApp({ database, runner, connectors: opts.connectors, env });
  return {
    database,
    runner,
    app,
    async close() {
      await runner.idle();
      await app.close();
      await database.close();
    },
  };
}
