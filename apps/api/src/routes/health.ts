import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

const startedAt = Date.now();

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/health',
    {
      schema: {
        response: {
          200: z.object({
            status: z.literal('ok'),
            database: z.object({ ok: z.boolean(), migration: z.string().nullable(), journalMode: z.string() }),
            uptimeSeconds: z.number(),
            time: z.string(),
          }),
        },
      },
    },
    async () => {
      const { sqlite } = app.deps.database;
      const row = sqlite.prepare('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1').get() as
        | { version: string }
        | undefined;
      return {
        status: 'ok' as const,
        database: {
          ok: true,
          migration: row?.version ?? null,
          journalMode: String(sqlite.pragma('journal_mode', { simple: true })),
        },
        uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
        time: new Date().toISOString(),
      };
    },
  );
};
