import { openDatabase } from '@ajh/database';
import { CONNECTORS } from '@ajh/job-sources';
import { DEFAULT_API_PORT } from '@ajh/shared';
import { pino } from 'pino';
import { buildApp } from './app.ts';
import { readCompanies } from './config/companies.ts';
import { CaptureRunner } from './pipeline/runner.ts';

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
const app = await buildApp({ database, connectors: CONNECTORS, env, runner }, { loggerInstance: logger });
const orphans = runner.recover();
if (orphans) app.log.warn({ orphans }, 'marked interrupted runs as failed');

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  if (runner.currentRunId) runner.cancel(runner.currentRunId);
  await runner.idle();
  await app.close();
  await database.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: HOST, port });
