import type { JobSummary } from '@ajh/shared';

export interface RunRow {
  id: number;
  trigger: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  sources_total: number;
  sources_done: number;
  sources_failed: number;
  jobs_found: number;
  jobs_new: number;
  jobs_updated: number;
  jobs_merged: number;
  error: string | null;
}

export interface RunSourceRow {
  id: number;
  source: string;
  status: string;
  found: number;
  new: number;
  updated: number;
  merged: number;
  invalid: number;
  errors: number;
  error_message: string | null;
  skip_reason: string | null;
  attempts: number;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
}

export interface RunDetail extends RunRow {
  sources: RunSourceRow[];
}

export interface Bucket {
  key: string | null;
  n: number;
}

export interface Stats {
  kpis: {
    total: number;
    active: number;
    newToday: number;
    publishedLast24h: number;
    remote: number;
    international: number;
    eligibleBrazil: number;
    favorites: number;
    unreviewed: number;
    applications: number;
    possiblyClosed: number;
    pendingReviews: number;
    sourcesWorking: number;
    sourcesFailing: number;
    sourcesEnabled: number;
    lastUpdate: string | null;
  };
  publishedPerDay: { day: string; n: number }[];
  capturedPerDay: { day: string; n: number }[];
  bySource: Bucket[];
  byCountry: Bucket[];
  byRemote: Bucket[];
  bySeniority: Bucket[];
  byTech: Bucket[];
  recentRuns: RunRow[];
  timezone: string;
}

export interface Facets {
  technologies: Bucket[];
  countries: Bucket[];
  sources: Bucket[];
  languages: Bucket[];
  currencies: Bucket[];
}

export interface ReviewItem {
  id: number;
  confidence: number;
  method: string;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  a: JobSummary | null;
  b: JobSummary | null;
  keptJobId: number | null;
  mergedTitle: string | null;
  mergedCompany: string | null;
}

export interface Company {
  name: string;
  ats: 'greenhouse' | 'lever' | 'ashby';
  slug: string;
  enabled: boolean;
}
