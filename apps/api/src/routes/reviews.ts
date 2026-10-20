import { dismissReview, getReview, listReviews, mergeJobs, searchJobs } from '@ajh/database';
import { JobsQuery } from '@ajh/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { readSettings } from '../config/settings.ts';
import { rescoreAll } from '../pipeline/ingest.ts';
import { toSummary } from '../lib/mappers.ts';

export const reviewRoutes: FastifyPluginAsyncZod = async (app) => {
  const { database, connectors } = app.deps;
  const { q } = database;

  const summaryOf = (id: number) => {
    const { rows } = searchJobs(q, JobsQuery.parse({ status: 'all', ignored: 'include', pageSize: 1 }), { limitOverride: 1, onlyIds: [id] });
    return rows[0] ? toSummary(rows[0], connectors) : null;
  };

  app.get(
    '/reviews',
    {
      schema: {
        querystring: z.object({
          status: z.enum(['pending', 'merged', 'dismissed']).default('pending'),
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(50).default(20),
        }),
      },
    },
    async (req) => {
      const { status, page, pageSize } = req.query;
      const { rows, total } = listReviews(q, status, pageSize, (page - 1) * pageSize);
      return {
        items: rows.map((r) => ({
          id: r.id,
          confidence: r.confidence,
          method: r.method,
          status: r.status,
          createdAt: r.created_at,
          resolvedAt: r.resolved_at,
          a: r.job_id === null ? null : summaryOf(r.job_id),
          b: r.candidate_job_id === null ? null : summaryOf(r.candidate_job_id),
          keptJobId: r.kept_job_id,
          mergedTitle: r.merged_title,
          mergedCompany: r.merged_company,
        })),
        total,
        page,
        pageSize,
      };
    },
  );

  app.post(
    '/reviews/:id',
    { schema: { params: z.object({ id: z.coerce.number().int() }), body: z.object({ action: z.enum(['merge', 'dismiss']) }) } },
    async (req, reply) => {
      const review = getReview(q, req.params.id);
      if (!review) return reply.code(404).send({ error: 'not_found' });
      if (review.status !== 'pending' || review.job_id === null || review.candidate_job_id === null) {
        return reply.code(409).send({ error: 'already_resolved' });
      }
      const now = new Date().toISOString();
      if (req.body.action === 'dismiss') {
        dismissReview(q, review.id, now);
        return { ok: true };
      }
      // keep the older job (lower id): it holds the earliest first_seen_at
      const [keep, drop] = review.job_id < review.candidate_job_id ? [review.job_id, review.candidate_job_id] : [review.candidate_job_id, review.job_id];
      mergeJobs(q, review.id, keep, drop, now);
      rescoreAll(q, readSettings(q, 'profile'));
      return { ok: true, keptJobId: keep };
    },
  );
};
