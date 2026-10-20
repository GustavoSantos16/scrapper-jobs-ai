import { join } from 'node:path';
import { findRepoRoot, openDatabase } from '@ajh/database';
import { CONNECTORS } from '@ajh/job-sources';
import { DEFAULT_API_PORT } from '@ajh/shared';
import { pino } from 'pino';
import { buildApp } from './app.ts';
import { readCompanies } from './config/companies.ts';
import { CaptureRunner } from './pipeline/runner.ts';
import { Scheduler } from './scheduler.ts';

const HOST = '127.0.0.1'; // local-only by design; never bind to 0.0.0.0
const port = Number(process.env.API_PORT ?? DEFAULT_API_PORT);

const database = openDatabase();
const env = process.env;
const logger = pino({
  level: env.LOG_LEVEL ?? 'info',
  redact: ['req.headers.authorization', 'req.headers.cookie'],
  ...(env.NODE_ENV !== 'production' && { transport: { target: 'pino-pretty' } }),
});

const runner = new CaptureRunner({ database, connectors: CONNECTORS, env, log: logger, loadCompanies: readCompanies });
const scheduler = new Scheduler({ database, runner, log: logger });
// production serves the built UI on the same origin; in dev Vite serves it and proxies /api
const webDist = env.NODE_ENV === 'production' ? (env.WEB_DIST ?? join(findRepoRoot(), 'apps', 'web', 'dist')) : undefined;
const app = await buildApp({ database, connectors: CONNECTORS, env, runner, scheduler }, { loggerInstance: logger }, { ...(webDist && { webDist }) });
const orphans = runner.recover();
if (orphans) app.log.warn({ orphans }, 'marked interrupted runs as failed');

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  scheduler.stop();
  if (runner.currentRunId) runner.cancel(runner.currentRunId);
  await runner.idle();
  await app.close();
  await database.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: HOST, port });
scheduler.start();
app.log.info(scheduler.status(), 'scheduler');
