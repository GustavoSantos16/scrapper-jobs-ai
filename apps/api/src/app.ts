import Fastify, { type FastifyServerOptions } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Database } from '@ajh/database';
import { healthRoutes } from './routes/health.ts';

export interface AppDeps {
  database: Database;
}

export async function buildApp(deps: AppDeps, opts: FastifyServerOptions = {}) {
  const app = Fastify(opts).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('deps', deps);
  await app.register(healthRoutes, { prefix: '/api' });
  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDeps;
  }
}
