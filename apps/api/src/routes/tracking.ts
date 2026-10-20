import { createSavedFilter, deleteSavedFilter, getJobRow, listSavedFilters, searchJobs, updateTracking } from '@ajh/database';
import { ApplicationState, JobsQuery, type JobSummary } from '@ajh/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { toSummary } from '../lib/mappers.ts';

const httpUrl = z.url({ protocol: /^https?$/ });
const EXPORT_LIMIT = 10_000;

export const trackingRoutes: FastifyPluginAsyncZod = async (app) => {
  const { database, connectors } = app.deps;
  const { q } = database;

  app.patch(
    '/jobs/:id/tracking',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int() }),
        body: z
          .object({
            state: ApplicationState.optional(),
            favorite: z.boolean().optional(),
            ignored: z.boolean().optional(),
            notes: z.string().max(20_000).optional(),
            appliedAt: z.iso.datetime({ offset: true }).nullable().optional(),
            recruiter: z.string().trim().max(300).nullable().optional(),
            processUrl: z.union([httpUrl, z.literal('')]).nullable().optional(),
          })
          .strict(),
      },
    },
    async (req, reply) => {
      if (!getJobRow(q, req.params.id)) return reply.code(404).send({ error: 'not_found' });
      const body = { ...req.body, ...(req.body.processUrl === '' && { processUrl: null }) };
      return { changed: updateTracking(q, req.params.id, body) };
    },
  );

  app.get('/saved-filters', async () => ({
    items: listSavedFilters(q).map((f) => ({ id: f.id, name: f.name, query: JSON.parse(f.query) as Record<string, string>, createdAt: f.created_at })),
  }));

  app.post(
    '/saved-filters',
    { schema: { body: z.object({ name: z.string().trim().min(1).max(80), query: z.record(z.string(), z.string().max(500)) }) } },
    async (req, reply) => {
      const f = createSavedFilter(q, req.body.name, JSON.stringify(req.body.query));
      return reply.code(201).send({ id: f.id, name: f.name, query: req.body.query, createdAt: f.created_at });
    },
  );

  app.delete('/saved-filters/:id', { schema: { params: z.object({ id: z.coerce.number().int() }) } }, async (req, reply) => {
    if (!deleteSavedFilter(q, req.params.id)) return reply.code(404).send({ error: 'not_found' });
    return { ok: true };
  });

  /** Exports every job matching the current filters (not just one page). */
  app.get(
    '/export',
    { schema: { querystring: JobsQuery.extend({ format: z.enum(['csv', 'json']).default('csv') }) } },
    async (req, reply) => {
      const { format, ...filters } = req.query;
      const { rows, total } = searchJobs(q, filters, { limitOverride: EXPORT_LIMIT });
      const items = rows.map((r) => toSummary(r, connectors));
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      reply.header('x-total-count', String(total));
      if (format === 'json') {
        reply.header('content-disposition', `attachment; filename="vagas-${stamp}.json"`);
        return { exportedAt: new Date().toISOString(), total, exported: items.length, filters, items };
      }
      reply.header('content-type', 'text/csv; charset=utf-8');
      reply.header('content-disposition', `attachment; filename="vagas-${stamp}.csv"`);
      return toCsv(items);
    },
  );
};

const CSV_COLUMNS: [string, (j: JobSummary) => unknown][] = [
  ['id', (j) => j.id],
  ['titulo', (j) => j.title],
  ['empresa', (j) => j.company],
  ['pontuacao', (j) => j.score],
  ['modalidade', (j) => j.remoteType],
  ['elegibilidade', (j) => j.geoEligibility.join('|')],
  ['pais', (j) => j.country],
  ['local', (j) => j.locationRaw],
  ['senioridade', (j) => j.seniority],
  ['contrato', (j) => j.contractTypes.join('|')],
  ['tecnologias', (j) => j.technologies.join('|')],
  ['idioma', (j) => j.language],
  ['salario_min', (j) => j.salaryMin],
  ['salario_max', (j) => j.salaryMax],
  ['moeda', (j) => j.salaryCurrency],
  ['periodo', (j) => j.salaryPeriod],
  ['publicada_em', (j) => j.publishedAt],
  ['primeira_vez_vista', (j) => j.firstSeenAt],
  ['ultima_vez_vista', (j) => j.lastSeenAt],
  ['situacao', (j) => j.status],
  ['estado_candidatura', (j) => j.tracking.state],
  ['favorita', (j) => (j.tracking.favorite ? 'sim' : 'nao')],
  ['fonte', (j) => j.primarySource.name],
  ['fontes', (j) => j.sourceCount],
  ['url', (j) => j.url],
];

/** RFC 4180 CSV; cells starting with = + - @ are prefixed to avoid spreadsheet formula injection. */
export function toCsv(items: JobSummary[]): string {
  const cell = (v: unknown) => {
    if (v === null || v === undefined) return '';
    let s = String(v);
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [CSV_COLUMNS.map(([h]) => h).join(','), ...items.map((j) => CSV_COLUMNS.map(([, f]) => cell(f(j))).join(','))];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
