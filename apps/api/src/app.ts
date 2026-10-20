import Fastify, { type FastifyServerOptions } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Database } from '@ajh/database';
import type { AnyConnector, CompanyConfig, HttpClient } from '@ajh/job-sources';
import type { CaptureRunner } from './pipeline/runner.ts';
import type { Scheduler } from './scheduler.ts';
import { healthRoutes } from './routes/health.ts';
import { securityHeaders, serveWeb } from './web.ts';
import { jobRoutes } from './routes/jobs.ts';
import { companyRoutes } from './routes/companies.ts';
import { runRoutes } from './routes/runs.ts';
import { schedulerRoutes } from './routes/scheduler.ts';
import { reviewRoutes } from './routes/reviews.ts';
import { sourceRoutes } from './routes/sources.ts';
import { settingsRoutes } from './routes/settings.ts';
import { statsRoutes } from './routes/stats.ts';
import { trackingRoutes } from './routes/tracking.ts';

export interface AppDeps {
  database: Database;
  runner: CaptureRunner;
  scheduler: Scheduler;
  connectors: AnyConnector[];
  env: Record<string, string | undefined>;
  /** Overridable for tests; default to config/companies.json. */
  loadCompanies?: () => CompanyConfig[];
  saveCompanies?: (companies: CompanyConfig[]) => CompanyConfig[];
  /** Test seam for outbound validation requests. */
  httpFactory?: (allowedHosts: string[]) => HttpClient;
}

export async function buildApp(deps: AppDeps, opts: FastifyServerOptions = {}, { webDist }: { webDist?: string } = {}) {
  const app = Fastify(opts).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('deps', deps);
  securityHeaders(app);
  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(jobRoutes, { prefix: '/api' });
  await app.register(runRoutes, { prefix: '/api' });
  await app.register(sourceRoutes, { prefix: '/api' });
  await app.register(companyRoutes, { prefix: '/api' });
  await app.register(statsRoutes, { prefix: '/api' });
  await app.register(reviewRoutes, { prefix: '/api' });
  await app.register(settingsRoutes, { prefix: '/api' });
  await app.register(trackingRoutes, { prefix: '/api' });
  await app.register(schedulerRoutes, { prefix: '/api' });
  if (webDist && !(await serveWeb(app, webDist))) app.log.warn({ webDist }, 'web build not found; run pnpm build');
  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDeps;
  }
}
