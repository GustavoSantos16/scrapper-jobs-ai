import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

export const jobRoutes: FastifyPluginAsyncZod = async (app) => {
  const { q } = app.deps.database;

  app.get(
    '/jobs',
    {
      schema: {
        querystring: z.object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(25),
        }),
      },
    },
    async (req) => {
      const { page, pageSize } = req.query;
      const items = q.all(
        q.db
          .selectFrom('jobs')
          .select(['id', 'title', 'company', 'url', 'published_at', 'first_seen_at', 'score', 'remote_type'])
          .select((eb) =>
            eb
              .selectFrom('job_listings as l')
              .select((e) => e.fn<string>('group_concat', ['l.source']).as('s'))
              .whereRef('l.job_id', '=', 'jobs.id')
              .as('sources'),
          )
          .orderBy('score', 'desc')
          .orderBy('id', 'desc')
          .limit(pageSize)
          .offset((page - 1) * pageSize),
      );
      const total = q.get(q.db.selectFrom('jobs').select((eb) => eb.fn.countAll<number>().as('n')))!.n;
      return { items, total, page, pageSize };
    },
  );
};
