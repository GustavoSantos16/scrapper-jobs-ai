import { openDatabase } from '@ajh/database';
import { DEFAULT_API_PORT } from '@ajh/shared';
import { buildApp } from './app.ts';

const HOST = '127.0.0.1'; // local-only by design; never bind to 0.0.0.0
const port = Number(process.env.API_PORT ?? DEFAULT_API_PORT);

const database = openDatabase();
const app = await buildApp(
  { database },
  {
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      redact: ['req.headers.authorization', 'req.headers.cookie'],
      ...(process.env.NODE_ENV !== 'production' && { transport: { target: 'pino-pretty' } }),
    },
  },
);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await database.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: HOST, port });
