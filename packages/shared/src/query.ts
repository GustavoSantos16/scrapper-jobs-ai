import { z } from 'zod';
import { ApplicationState, ContractType, GeoTag, RemoteType, Seniority } from './domain.ts';

/** "a,b,c" (querystring) or ["a","b"] (JSON) → string[] */
const list = <T extends z.ZodType<string>>(item: T) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : v),
    z.array(item).max(50),
  );
const bool = z.preprocess((v) => (v === 'true' || v === '1' ? true : v === 'false' || v === '0' ? false : v), z.boolean());
const isoDate = z.iso.datetime({ offset: true });

export const SORTS = ['published', 'captured', 'relevance', 'score', 'company', 'title'] as const;
export const JobSort = z.enum(SORTS);
export type JobSort = z.infer<typeof JobSort>;

/** Every filter of the job search. All filters combine with AND; list values combine with OR. */
export const JobsQuery = z.object({
  q: z.string().trim().max(200).optional(),
  title: z.string().trim().max(200).optional(),
  company: z.string().trim().max(200).optional(),
  city: z.string().trim().max(100).optional(),
  tech: list(z.string().max(60)).optional(),
  country: list(z.string().length(2)).optional(),
  remote: list(RemoteType).optional(),
  contract: list(ContractType).optional(),
  seniority: list(Seniority).optional(),
  source: list(z.string().max(60)).optional(),
  language: list(z.string().max(5)).optional(),
  geo: list(GeoTag).optional(),
  /** Only jobs a candidate in Brazil may apply to (worldwide/americas/latam/brazil). */
  eligibleBrazil: bool.optional(),
  /** Jobs not based in Brazil (country unknown or other than BR). */
  international: bool.optional(),
  salaryMin: z.coerce.number().positive().optional(),
  salaryMax: z.coerce.number().positive().optional(),
  salaryCurrency: z.string().length(3).optional(),
  hasSalary: bool.optional(),
  publishedFrom: isoDate.optional(),
  publishedTo: isoDate.optional(),
  /** Only jobs whose publication date is unknown. */
  publishedUnknown: bool.optional(),
  seenFrom: isoDate.optional(),
  seenTo: isoDate.optional(),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  favorite: bool.optional(),
  /** true = state other than "new"; false = still "new". */
  reviewed: bool.optional(),
  state: list(ApplicationState).optional(),
  /** Excludes jobs in any of these states (a job without tracking counts as "new"). */
  excludeState: list(ApplicationState).optional(),
  /** Ignored jobs are hidden unless asked for. */
  ignored: z.enum(['hide', 'only', 'include']).default('hide'),
  status: z.enum(['active', 'possibly_closed', 'all']).default('active'),
  sort: JobSort.default('relevance'),
  order: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type JobsQuery = z.infer<typeof JobsQuery>;
export type JobsQueryInput = z.input<typeof JobsQuery>;
