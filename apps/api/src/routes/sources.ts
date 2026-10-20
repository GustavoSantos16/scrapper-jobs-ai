import { getSourceState, listSourceStates, upsertSourceState } from '@ajh/database';
import { MANUAL_SOURCES, type AnyConnector } from '@ajh/job-sources';
import type { SourceInfo, SourceStatus } from '@ajh/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { readCompanies } from '../config/companies.ts';
import { readSettings } from '../config/settings.ts';
import { effectiveIntervalMinutes } from '../pipeline/runner.ts';

export const sourceRoutes: FastifyPluginAsyncZod = async (app) => {
  const { database, connectors, env } = app.deps;
  const { q } = database;
  const loadCompanies = app.deps.loadCompanies ?? readCompanies;

  function describe(c: AnyConnector, states: Map<string, ReturnType<typeof getSourceState>>, active: Map<string, number>): SourceInfo {
    const s = states.get(c.id);
    const missingEnv = (c.requiredEnv ?? []).filter((k) => !env[k]);
    const companies = c.usesCompanies ? loadCompanies().filter((x) => x.ats === c.usesCompanies && x.enabled !== false) : [];
    const enabled = s ? Boolean(s.enabled) : true;
    let status: SourceStatus;
    let statusReason: string;
    if (missingEnv.length) {
      status = 'requires_credential';
      statusReason = `Defina ${missingEnv.join(' e ')} no .env para ativar.`;
    } else if (!enabled) {
      status = 'disabled';
      statusReason = 'Desativada por você.';
    } else if (c.usesCompanies && !companies.length) {
      status = 'never_run';
      statusReason = 'Nenhuma empresa configurada para este ATS.';
    } else if (!s?.last_run_at) {
      status = 'never_run';
      statusReason = 'Ainda não executada.';
    } else if (s.last_status === 'failed') {
      status = 'failing';
      statusReason = s.last_error ?? 'Falhou na última execução.';
    } else if ((s.last_found ?? 0) > 0) {
      status = 'working';
      statusReason = `Última execução capturou ${s.last_found} vaga(s).`;
    } else {
      status = 'no_jobs';
      statusReason = 'Última execução terminou sem vagas.';
    }
    const interval = effectiveIntervalMinutes(c, s?.min_interval_minutes);
    const nextAllowed = s?.last_run_at ? new Date(Date.parse(s.last_run_at) + interval * 60_000).toISOString() : null;
    return {
      id: c.id,
      name: c.name,
      kind: c.kind,
      status,
      statusReason,
      homepageUrl: c.homepageUrl,
      docsUrl: c.docsUrl,
      attribution: c.attribution,
      description: c.description,
      automated: true,
      enabled,
      rateLimit: c.rateLimit,
      overrides: { minIntervalMinutes: s?.min_interval_minutes ?? null, maxRequests: s?.max_requests ?? null },
      effectiveIntervalMinutes: interval,
      nextAllowedAt: nextAllowed && nextAllowed > new Date().toISOString() ? nextAllowed : null,
      requiredEnv: [...(c.requiredEnv ?? [])],
      missingEnv,
      usesCompanies: c.usesCompanies ?? null,
      companiesCount: companies.length,
      lastRunAt: s?.last_run_at ?? null,
      lastSuccessAt: s?.last_success_at ?? null,
      lastStatus: s?.last_status ?? null,
      lastError: s?.last_error ?? null,
      lastFound: s?.last_found ?? null,
      lastNew: s?.last_new ?? null,
      lastDurationMs: s?.last_duration_ms ?? null,
      consecutiveFailures: s?.consecutive_failures ?? 0,
      activeJobs: active.get(c.id) ?? 0,
      searchLinks: [],
    };
  }

  app.get('/sources', async () => {
    const states = new Map(listSourceStates(q).map((s) => [s.source, s]));
    const active = new Map(
      q
        .all(
          q.db
            .selectFrom('job_listings')
            .select(['source', (eb) => eb.fn.countAll<number>().as('n')])
            .where('status', '=', 'active')
            .groupBy('source'),
        )
        .map((r) => [r.source, r.n]),
    );
    const profile = readSettings(q, 'profile');
    const automated = connectors.map((c) => describe(c, states, active));
    const manual: SourceInfo[] = MANUAL_SOURCES.map((m) => ({
      id: m.id,
      name: m.name,
      kind: m.kind,
      status: m.kind,
      statusReason: m.reason,
      homepageUrl: m.homepageUrl,
      docsUrl: m.homepageUrl,
      attribution: '',
      description: m.reason,
      automated: false,
      enabled: false,
      rateLimit: null,
      overrides: { minIntervalMinutes: null, maxRequests: null },
      effectiveIntervalMinutes: null,
      nextAllowedAt: null,
      requiredEnv: [],
      missingEnv: [],
      usesCompanies: null,
      companiesCount: 0,
      lastRunAt: null,
      lastSuccessAt: null,
      lastStatus: null,
      lastError: null,
      lastFound: null,
      lastNew: null,
      lastDurationMs: null,
      consecutiveFailures: 0,
      activeJobs: 0,
      searchLinks: m.searchLinks(profile),
    }));
    return { items: [...automated, ...manual] };
  });

  app.patch(
    '/sources/:id',
    {
      schema: {
        params: z.object({ id: z.string() }),
        body: z.object({
          enabled: z.boolean().optional(),
          minIntervalMinutes: z.number().int().min(1).max(10_080).nullable().optional(),
          maxRequests: z.number().int().min(1).max(1000).nullable().optional(),
        }),
      },
    },
    async (req, reply) => {
      const c = connectors.find((x) => x.id === req.params.id);
      if (!c) return reply.code(404).send({ error: 'not_found', message: 'Fonte sem captura automatizada ou inexistente' });
      const { enabled, minIntervalMinutes, maxRequests } = req.body;
      if (minIntervalMinutes != null && minIntervalMinutes < c.rateLimit.minIntervalMinutes) {
        return reply.code(400).send({
          error: 'below_source_minimum',
          message: `O intervalo mínimo desta fonte é ${c.rateLimit.minIntervalMinutes} min`,
        });
      }
      if (maxRequests != null && maxRequests > c.rateLimit.maxRequestsPerRun) {
        return reply.code(400).send({
          error: 'above_source_maximum',
          message: `O máximo desta fonte é ${c.rateLimit.maxRequestsPerRun} requisições por execução`,
        });
      }
      upsertSourceState(q, c.id, {
        ...(enabled !== undefined && { enabled: enabled ? 1 : 0 }),
        ...(minIntervalMinutes !== undefined && { min_interval_minutes: minIntervalMinutes }),
        ...(maxRequests !== undefined && { max_requests: maxRequests }),
      });
      const states = new Map([[c.id, getSourceState(q, c.id)]]);
      return describe(c, states, new Map());
    },
  );
};
