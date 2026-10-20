import Fastify, { type FastifyServerOptions } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Database } from '@ajh/database';
import type { AnyConnector, CompanyConfig, HttpClient } from '@ajh/job-sources';
import type { CaptureRunner } from './pipeline/runner.ts';
import { healthRoutes } from './routes/health.ts';
import { jobRoutes } from './routes/jobs.ts';
import { companyRoutes } from './routes/companies.ts';
import { runRoutes } from './routes/runs.ts';
import { sourceRoutes } from './routes/sources.ts';

export interface AppDeps {
  database: Database;
  runner: CaptureRunner;
  connectors: AnyConnector[];
  env: Record<string, string | undefined>;
  /** Overridable for tests; default to config/companies.json. */
  loadCompanies?: () => CompanyConfig[];
  saveCompanies?: (companies: CompanyConfig[]) => CompanyConfig[];
  /** Test seam for outbound validation requests. */
  httpFactory?: (allowedHosts: string[]) => HttpClient;
}

export async function buildApp(deps: AppDeps, opts: FastifyServerOptions = {}) {
  const app = Fastify(opts).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('deps', deps);
  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(jobRoutes, { prefix: '/api' });
  await app.register(runRoutes, { prefix: '/api' });
  await app.register(sourceRoutes, { prefix: '/api' });
  await app.register(companyRoutes, { prefix: '/api' });
  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDeps;
  }
}
