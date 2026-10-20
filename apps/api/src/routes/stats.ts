import { dashboardStats, facets, listRuns, listSourceStates } from '@ajh/database';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { readSettings } from '../config/settings.ts';
import { startOfDay, tzOffsetMinutes } from '../lib/time.ts';

export const statsRoutes: FastifyPluginAsyncZod = async (app) => {
  const { database, connectors, env } = app.deps;
  const { q } = database;

  app.get('/stats', async () => {
    const { timezone } = readSettings(q, 'display');
    const now = new Date();
    const stats = dashboardStats(q, {
      todayStart: startOfDay(timezone, now).toISOString(),
      last24h: new Date(now.getTime() - 86_400_000).toISOString(),
      chartFrom: startOfDay(timezone, now, 29).toISOString(),
      tzOffsetMinutes: tzOffsetMinutes(timezone, now),
    });
    const states = new Map(listSourceStates(q).map((s) => [s.source, s]));
    const runnable = connectors.filter((c) => !(c.requiredEnv ?? []).some((k) => !env[k]) && states.get(c.id)?.enabled !== 0);
    const sourcesWorking = runnable.filter((c) => {
      const s = states.get(c.id);
      return s?.last_status === 'success' && (s.last_found ?? 0) > 0;
    }).length;
    const sourcesFailing = runnable.filter((c) => states.get(c.id)?.last_status === 'failed').length;
    const recentRuns = listRuns(q, 10);
    const lastFinished = recentRuns.find((r) => r.finished_at && r.status !== 'skipped');
    return {
      ...stats,
      kpis: {
        ...stats.kpis,
        sourcesWorking,
        sourcesFailing,
        sourcesEnabled: runnable.length,
        lastUpdate: lastFinished?.finished_at ?? null,
      },
      recentRuns,
      timezone,
    };
  });

  app.get('/facets', async () => facets(q));
};
