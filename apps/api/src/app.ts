import Fastify, { type FastifyServerOptions } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Database } from '@ajh/database';
import type { AnyConnector } from '@ajh/job-sources';
import type { CaptureRunner } from './pipeline/runner.ts';
import { healthRoutes } from './routes/health.ts';
import { jobRoutes } from './routes/jobs.ts';
import { runRoutes } from './routes/runs.ts';

export interface AppDeps {
  database: Database;
  runner: CaptureRunner;
  connectors: AnyConnector[];
  env: Record<string, string | undefined>;
}

export async function buildApp(deps: AppDeps, opts: FastifyServerOptions = {}) {
  const app = Fastify(opts).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('deps', deps);
  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(jobRoutes, { prefix: '/api' });
  await app.register(runRoutes, { prefix: '/api' });
  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDeps;
  }
}
