import type { Generated } from 'kysely';

// Row types mirror migrations/*.sql. JSON columns are stored as TEXT.

export interface JobsTable {
  id: Generated<number>;
  primary_listing_id: number | null;
  title: string;
  company: string | null;
  company_normalized: string | null;
  description_html: string | null;
  description_text: string | null;
  summary: string | null;
  url: string;
  canonical_url: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  location_raw: string | null;
  remote_type: string;
  geo_eligibility: string;
  contract_types: string;
  seniority: string;
  technologies: string;
  language: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;
  identity_hash: string | null;
  published_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
  updated_at: string;
  status: string;
  score: number;
  score_breakdown: string;
}

export interface JobListingsTable {
  id: Generated<number>;
  job_id: number;
  source: string;
  source_job_id: string;
  url: string;
  canonical_url: string | null;
  ats_key: string | null;
  title: string;
  company: string | null;
  published_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
  missed_runs: Generated<number>;
  status: Generated<string>;
  match_method: Generated<string>;
  match_confidence: Generated<number>;
  content_hash: string | null;
}

export interface JobTrackingTable {
  job_id: number;
  state: Generated<string>;
  favorite: Generated<number>;
  ignored: Generated<number>;
  notes: Generated<string>;
  applied_at: string | null;
  recruiter: string | null;
  process_url: string | null;
  updated_at: string;
}

export interface JobStateHistoryTable {
  id: Generated<number>;
  job_id: number;
  field: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
}

export interface DedupReviewsTable {
  id: Generated<number>;
  job_id: number;
  candidate_job_id: number;
  confidence: number;
  method: string;
  status: Generated<string>;
  created_at: string;
  resolved_at: string | null;
}

export interface RunsTable {
  id: Generated<number>;
  trigger: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  sources_total: Generated<number>;
  sources_done: Generated<number>;
  sources_failed: Generated<number>;
  jobs_found: Generated<number>;
  jobs_new: Generated<number>;
  jobs_updated: Generated<number>;
  jobs_merged: Generated<number>;
  error: string | null;
}

export interface RunSourcesTable {
  id: Generated<number>;
  run_id: number;
  source: string;
  status: string;
  found: Generated<number>;
  new: Generated<number>;
  updated: Generated<number>;
  merged: Generated<number>;
  invalid: Generated<number>;
  errors: Generated<number>;
  error_message: string | null;
  skip_reason: string | null;
  attempts: Generated<number>;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
}

export interface SourceStateTable {
  source: string;
  enabled: Generated<number>;
  last_run_at: string | null;
  last_success_at: string | null;
  last_status: string | null;
  last_error: string | null;
  last_found: number | null;
  last_new: number | null;
  last_duration_ms: number | null;
  consecutive_failures: Generated<number>;
  min_interval_minutes: number | null;
  max_requests: number | null;
}

export interface SettingsTable {
  key: string;
  value: string;
  updated_at: string;
}

export interface SavedFiltersTable {
  id: Generated<number>;
  name: string;
  query: string;
  created_at: string;
}

export interface HttpCacheTable {
  url: string;
  etag: string | null;
  last_modified: string | null;
  status: number;
  content_type: string | null;
  body: Buffer;
  fetched_at: string;
}

export interface LocksTable {
  name: string;
  owner: string;
  acquired_at: string;
  expires_at: string;
}

export interface DB {
  jobs: JobsTable;
  job_listings: JobListingsTable;
  job_tracking: JobTrackingTable;
  job_state_history: JobStateHistoryTable;
  dedup_reviews: DedupReviewsTable;
  runs: RunsTable;
  run_sources: RunSourcesTable;
  source_state: SourceStateTable;
  settings: SettingsTable;
  saved_filters: SavedFiltersTable;
  http_cache: HttpCacheTable;
  locks: LocksTable;
}
