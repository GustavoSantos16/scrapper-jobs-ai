import { countRuns, getRun, listRuns } from '@ajh/database';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { RunConflictError } from '../pipeline/runner.ts';

export const runRoutes: FastifyPluginAsyncZod = async (app) => {
  const { database, runner, connectors } = app.deps;
  const { q } = database;

  app.post(
    '/runs',
    { schema: { body: z.object({ sources: z.array(z.string()).optional() }).nullish() } },
    async (req, reply) => {
      const known = new Set(connectors.map((c) => c.id));
      const sources = req.body?.sources?.filter((s) => known.has(s));
      try {
        const { runId } = runner.start({ trigger: 'manual', ...(sources?.length && { sources }) });
        return reply.code(202).send({ runId });
      } catch (err) {
        if (err instanceof RunConflictError) {
          return reply.code(409).send({ error: 'run_in_progress', message: err.message, runId: runner.currentRunId });
        }
        throw err;
      }
    },
  );

  app.get(
    '/runs',
    { schema: { querystring: z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) }) } },
    async (req) => {
      const { page, pageSize } = req.query;
      return { items: listRuns(q, pageSize, (page - 1) * pageSize), total: countRuns(q), page, pageSize, currentRunId: runner.currentRunId };
    },
  );

  app.get('/runs/:id', { schema: { params: z.object({ id: z.coerce.number().int() }) } }, async (req, reply) => {
    const run = getRun(q, req.params.id);
    if (!run) return reply.code(404).send({ error: 'not_found' });
    return run;
  });

  app.post('/runs/:id/cancel', { schema: { params: z.object({ id: z.coerce.number().int() }) } }, async (req, reply) => {
    if (!runner.cancel(req.params.id)) return reply.code(409).send({ error: 'not_running' });
    return { ok: true };
  });
};
