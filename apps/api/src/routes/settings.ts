import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { DisplaySettings, PipelineSettings, readSettings, writeSettings } from '../config/settings.ts';
import { isValidTimeZone } from '../lib/time.ts';
import { rescoreAll } from '../pipeline/ingest.ts';
import { Profile } from '@ajh/shared';

export const settingsRoutes: FastifyPluginAsyncZod = async (app) => {
  const { q } = app.deps.database;

  app.get('/settings', async () => ({
    profile: readSettings(q, 'profile'),
    pipeline: readSettings(q, 'pipeline'),
    display: readSettings(q, 'display'),
    scheduler: readSettings(q, 'scheduler'),
  }));

  app.put('/settings/profile', { schema: { body: Profile } }, async (req) => {
    const saved = writeSettings(q, 'profile', req.body);
    // the score depends on the profile: recompute it for every job right away
    const rescored = rescoreAll(q, saved);
    return { profile: saved, rescored };
  });

  app.put('/settings/pipeline', { schema: { body: PipelineSettings } }, async (req) => ({ pipeline: writeSettings(q, 'pipeline', req.body) }));

  app.put(
    '/settings/display',
    { schema: { body: DisplaySettings.extend({ timezone: z.string().refine(isValidTimeZone, 'Fuso horário inválido (use um nome IANA, ex.: America/Sao_Paulo)') }) } },
    async (req) => ({ display: writeSettings(q, 'display', req.body) }),
  );
};
