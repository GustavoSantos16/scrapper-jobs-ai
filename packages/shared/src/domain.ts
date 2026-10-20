import { z } from 'zod';

export const REMOTE_TYPES = ['remote', 'hybrid', 'onsite', 'unknown'] as const;
export const RemoteType = z.enum(REMOTE_TYPES);
export type RemoteType = z.infer<typeof RemoteType>;

export const CONTRACT_TYPES = [
  'clt',
  'pj',
  'contractor',
  'full_time',
  'part_time',
  'freelance',
  'internship',
  'temporary',
] as const;
export const ContractType = z.enum(CONTRACT_TYPES);
export type ContractType = z.infer<typeof ContractType>;

export const SENIORITIES = ['intern', 'junior', 'mid', 'senior', 'staff', 'lead', 'principal', 'unknown'] as const;
export const Seniority = z.enum(SENIORITIES);
export type Seniority = z.infer<typeof Seniority>;

/**
 * Geographic eligibility tags. The "*_only" and "restricted_other" tags mean an explicit
 * restriction; the others mean a candidate in Brazil may apply.
 */
export const GEO_TAGS = [
  'worldwide',
  'americas',
  'latam',
  'brazil',
  'us_only',
  'canada_only',
  'uk_only',
  'eu_only',
  'restricted_other',
] as const;
export const GeoTag = z.enum(GEO_TAGS);
export type GeoTag = z.infer<typeof GeoTag>;
export const BRAZIL_ELIGIBLE_GEO: readonly GeoTag[] = ['worldwide', 'americas', 'latam', 'brazil'];

export const SALARY_PERIODS = ['year', 'month', 'week', 'day', 'hour', 'task'] as const;
export const SalaryPeriod = z.enum(SALARY_PERIODS);
export type SalaryPeriod = z.infer<typeof SalaryPeriod>;

export const JOB_STATUSES = ['active', 'possibly_closed'] as const;
export const JobStatus = z.enum(JOB_STATUSES);
export type JobStatus = z.infer<typeof JobStatus>;

export const APPLICATION_STATES = [
  'new',
  'reviewed',
  'want_to_apply',
  'applied',
  'interview',
  'closed',
  'rejected',
  'offer',
] as const;
export const ApplicationState = z.enum(APPLICATION_STATES);
export type ApplicationState = z.infer<typeof ApplicationState>;

export const SOURCE_KINDS = [
  'official_api',
  'public_feed',
  'public_page',
  'ats',
  'requires_credential',
  'manual_link',
  'unavailable',
] as const;
export const SourceKind = z.enum(SOURCE_KINDS);
export type SourceKind = z.infer<typeof SourceKind>;

/** Real operational status shown in the Sources screen. */
export const SOURCE_STATUSES = [
  'working', // last run captured jobs
  'no_jobs', // last run succeeded but returned zero jobs
  'failing', // last run failed
  'never_run',
  'disabled',
  'requires_credential',
  'manual_link',
  'unavailable',
] as const;
export const SourceStatus = z.enum(SOURCE_STATUSES);
export type SourceStatus = z.infer<typeof SourceStatus>;

export const MATCH_METHODS = ['primary', 'url', 'ats_id', 'identity', 'similarity', 'manual'] as const;
export const MatchMethod = z.enum(MATCH_METHODS);
export type MatchMethod = z.infer<typeof MatchMethod>;

const isoDate = z.iso.datetime({ offset: true });
const httpUrl = z.url({ protocol: /^https?$/ });

/** A job after a connector normalized it, before dedup. Validated with Zod in the pipeline. */
export const NormalizedJob = z.object({
  source: z.string().min(1),
  sourceJobId: z.string().min(1),
  title: z.string().min(1).max(500),
  company: z.string().max(300).nullable(),
  descriptionHtml: z.string().nullable(),
  descriptionText: z.string().nullable(),
  summary: z.string().nullable(),
  url: httpUrl,
  canonicalUrl: z.string().nullable(),
  atsKey: z.string().nullable(),
  country: z.string().length(2).nullable(),
  region: z.string().nullable(),
  city: z.string().nullable(),
  locationRaw: z.string().nullable(),
  remoteType: RemoteType,
  geoEligibility: z.array(GeoTag),
  contractTypes: z.array(ContractType),
  seniority: Seniority,
  technologies: z.array(z.string()),
  language: z.string().nullable(),
  salaryMin: z.number().positive().nullable(),
  salaryMax: z.number().positive().nullable(),
  salaryCurrency: z.string().length(3).nullable(),
  salaryPeriod: SalaryPeriod.nullable(),
  publishedAt: isoDate.nullable(),
});
export type NormalizedJob = z.infer<typeof NormalizedJob>;

export const ScoreReason = z.object({
  key: z.string(),
  label: z.string(),
  points: z.number(),
  max: z.number(),
  reason: z.string(),
});
export type ScoreReason = z.infer<typeof ScoreReason>;
