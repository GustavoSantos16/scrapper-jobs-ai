import { deleteJob, getHistory, getJobRow, getListings, getReviewsForJob, getTracking, searchJobs } from '@ajh/database';
import type {
  ApplicationState,
  ContractType,
  GeoTag,
  JobDetail,
  JobStatus,
  MatchMethod,
  Page,
  JobSummary,
  RemoteType,
  SalaryPeriod,
  ScoreReason,
  Seniority,
} from '@ajh/shared';
import { JobsQuery } from '@ajh/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { parseJson, sourceRef, toSummary } from '../lib/mappers.ts';

export const jobRoutes: FastifyPluginAsyncZod = async (app) => {
  const { database, connectors } = app.deps;
  const { q } = database;

  app.get('/jobs', { schema: { querystring: JobsQuery } }, async (req): Promise<Page<JobSummary>> => {
    const { rows, total } = searchJobs(q, req.query);
    return { items: rows.map((r) => toSummary(r, connectors)), total, page: req.query.page, pageSize: req.query.pageSize };
  });

  app.get('/jobs/:id', { schema: { params: z.object({ id: z.coerce.number().int() }) } }, async (req, reply) => {
    const job = getJobRow(q, req.params.id);
    if (!job) return reply.code(404).send({ error: 'not_found' });
    const listings = getListings(q, job.id);
    const primary = listings.find((l) => l.id === job.primary_listing_id) ?? listings[0];
    const t = getTracking(q, job.id);
    const detail: JobDetail = {
      id: job.id,
      title: job.title,
      company: job.company,
      summary: job.summary,
      url: job.url,
      primarySource: sourceRef(connectors, primary?.source ?? 'unknown', primary?.url ?? job.url),
      sourceCount: listings.length,
      country: job.country,
      city: job.city,
      region: job.region,
      locationRaw: job.location_raw,
      remoteType: job.remote_type as RemoteType,
      geoEligibility: parseJson<GeoTag[]>(job.geo_eligibility),
      contractTypes: parseJson<ContractType[]>(job.contract_types),
      seniority: job.seniority as Seniority,
      technologies: parseJson<string[]>(job.technologies),
      language: job.language,
      salaryMin: job.salary_min,
      salaryMax: job.salary_max,
      salaryCurrency: job.salary_currency,
      salaryPeriod: job.salary_period as SalaryPeriod | null,
      publishedAt: job.published_at,
      firstSeenAt: job.first_seen_at,
      lastSeenAt: job.last_seen_at,
      updatedAt: job.updated_at,
      status: job.status as JobStatus,
      score: job.score,
      scoreBreakdown: parseJson<ScoreReason[]>(job.score_breakdown),
      descriptionHtml: job.description_html,
      descriptionText: job.description_text,
      canonicalUrl: job.canonical_url,
      listings: listings.map((l) => {
        const ref = sourceRef(connectors, l.source, l.url);
        return {
          id: l.id,
          source: l.source,
          sourceName: ref.name,
          attribution: ref.attribution,
          sourceJobId: l.source_job_id,
          url: l.url,
          publishedAt: l.published_at,
          firstSeenAt: l.first_seen_at,
          lastSeenAt: l.last_seen_at,
          status: l.status as JobStatus,
          missedRuns: l.missed_runs,
          matchMethod: l.match_method as MatchMethod,
          matchConfidence: l.match_confidence,
          isPrimary: l.id === job.primary_listing_id,
        };
      }),
      tracking: {
        state: (t?.state ?? 'new') as ApplicationState,
        favorite: Boolean(t?.favorite),
        ignored: Boolean(t?.ignored),
        notes: t?.notes ?? '',
        appliedAt: t?.applied_at ?? null,
        recruiter: t?.recruiter ?? null,
        processUrl: t?.process_url ?? null,
        updatedAt: t?.updated_at ?? null,
      },
      history: getHistory(q, job.id).map((h) => ({ id: h.id, field: h.field, oldValue: h.old_value, newValue: h.new_value, changedAt: h.changed_at })),
      reviews: getReviewsForJob(q, job.id),
    };
    return detail;
  });

  app.delete('/jobs/:id', { schema: { params: z.object({ id: z.coerce.number().int() }) } }, async (req, reply) => {
    const result = deleteJob(q, req.params.id);
    if (!result) return reply.code(404).send({ error: 'not_found' });
    return { ok: true, ...result };
  });
};
