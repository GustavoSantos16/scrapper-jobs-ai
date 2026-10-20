import type {
  ApplicationState,
  ContractType,
  GeoTag,
  JobStatus,
  MatchMethod,
  RemoteType,
  SalaryPeriod,
  ScoreReason,
  Seniority,
  SourceKind,
  SourceStatus,
} from './domain.ts';

/** Response shapes of the local API, shared with the web app. */

export interface SourceRef {
  source: string;
  name: string;
  url: string;
  attribution: string;
}

export interface JobSummary {
  id: number;
  title: string;
  company: string | null;
  summary: string | null;
  url: string;
  primarySource: SourceRef;
  sourceCount: number;
  country: string | null;
  city: string | null;
  locationRaw: string | null;
  remoteType: RemoteType;
  geoEligibility: GeoTag[];
  contractTypes: ContractType[];
  seniority: Seniority;
  technologies: string[];
  language: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: SalaryPeriod | null;
  publishedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  status: JobStatus;
  score: number;
  tracking: { state: ApplicationState; favorite: boolean; ignored: boolean; hasNotes: boolean };
}

export interface ListingInfo {
  id: number;
  source: string;
  sourceName: string;
  attribution: string;
  sourceJobId: string;
  url: string;
  publishedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  status: JobStatus;
  missedRuns: number;
  matchMethod: MatchMethod;
  matchConfidence: number;
  isPrimary: boolean;
}

export interface Tracking {
  state: ApplicationState;
  favorite: boolean;
  ignored: boolean;
  notes: string;
  appliedAt: string | null;
  recruiter: string | null;
  processUrl: string | null;
  updatedAt: string | null;
}

export interface HistoryEntry {
  id: number;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changedAt: string;
}

export interface JobDetail extends Omit<JobSummary, 'tracking'> {
  descriptionHtml: string | null;
  descriptionText: string | null;
  region: string | null;
  canonicalUrl: string | null;
  updatedAt: string;
  scoreBreakdown: ScoreReason[];
  listings: ListingInfo[];
  tracking: Tracking;
  history: HistoryEntry[];
  reviews: { id: number; otherJobId: number; otherTitle: string; otherCompany: string | null; confidence: number; status: string }[];
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SourceInfo {
  id: string;
  name: string;
  kind: SourceKind;
  status: SourceStatus;
  statusReason: string;
  homepageUrl: string;
  docsUrl: string;
  attribution: string;
  description: string;
  automated: boolean;
  enabled: boolean;
  rateLimit: { minIntervalMinutes: number; maxRequestsPerRun: number; minDelayMs: number } | null;
  overrides: { minIntervalMinutes: number | null; maxRequests: number | null };
  effectiveIntervalMinutes: number | null;
  nextAllowedAt: string | null;
  requiredEnv: string[];
  missingEnv: string[];
  usesCompanies: string | null;
  companiesCount: number;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  lastFound: number | null;
  lastNew: number | null;
  lastDurationMs: number | null;
  consecutiveFailures: number;
  activeJobs: number;
  searchLinks: { label: string; url: string }[];
}
