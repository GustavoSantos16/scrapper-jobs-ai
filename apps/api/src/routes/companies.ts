import { HttpClient, HttpError, type CompanyConfig } from '@ajh/job-sources';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { Company, readCompanies, writeCompanies } from '../config/companies.ts';

const BOARD_URL: Record<CompanyConfig['ats'], (slug: string) => string> = {
  greenhouse: (s) => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(s)}/jobs`,
  lever: (s) => `https://api.lever.co/v0/postings/${encodeURIComponent(s)}?mode=json&limit=1`,
  ashby: (s) => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(s)}`,
};
const BOARD_HOSTS = ['boards-api.greenhouse.io', 'api.lever.co', 'api.ashbyhq.com'];

export const companyRoutes: FastifyPluginAsyncZod = async (app) => {
  const load = app.deps.loadCompanies ?? readCompanies;
  const save = app.deps.saveCompanies ?? writeCompanies;

  app.get('/companies', async () => ({ items: load() }));

  app.put('/companies', { schema: { body: z.object({ companies: z.array(Company).max(500) }) } }, async (req, reply) => {
    const keys = req.body.companies.map((c) => `${c.ats}:${c.slug.toLowerCase()}`);
    if (new Set(keys).size !== keys.length) return reply.code(400).send({ error: 'duplicate', message: 'Empresa duplicada (mesmo ATS e slug)' });
    return { items: save(req.body.companies) };
  });

  /** Checks that a board exists with one request (backend-side, SSRF-guarded). */
  app.post(
    '/companies/validate',
    { schema: { body: Company.pick({ ats: true, slug: true }) } },
    async (req) => {
      const http = app.deps.httpFactory?.(BOARD_HOSTS) ?? new HttpClient({ allowedHosts: BOARD_HOSTS, maxRequests: 1, maxRetries: 1, timeoutMs: 15_000 });
      try {
        const data = await http.getJson<unknown>(BOARD_URL[req.body.ats](req.body.slug), { cache: false });
        const jobs = Array.isArray(data) ? data.length : ((data as { jobs?: unknown[] }).jobs?.length ?? 0);
        return { ok: true, jobs };
      } catch (err) {
        const status = err instanceof HttpError ? err.status : null;
        return { ok: false, jobs: 0, message: status === 404 ? 'Board não encontrado (HTTP 404)' : (err as Error).message };
      }
    },
  );
};
