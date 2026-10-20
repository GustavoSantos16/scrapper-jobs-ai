import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { SchedulerSettings } from '../config/settings.ts';
import { reprocessAll } from '../pipeline/reprocess.ts';

export const schedulerRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/scheduler', async () => app.deps.scheduler.status());
  app.put('/scheduler', { schema: { body: SchedulerSettings } }, async (req) => app.deps.scheduler.configure(req.body));

  /** Re-normalizes stored jobs from their raw payloads (no network). */
  app.post('/maintenance/reprocess', async (req, reply) => {
    if (app.deps.runner.currentRunId !== null) return reply.code(409).send({ error: 'run_in_progress', message: 'Aguarde a captura em andamento terminar' });
    return reprocessAll(app.deps.database, app.deps.connectors);
  });
};
