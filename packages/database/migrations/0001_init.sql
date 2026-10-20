-- 0001_init: core schema for AI Job Hunter.
-- All timestamps are ISO-8601 UTC strings ("2026-10-20T12:00:00.000Z").

-- A consolidated job. Its descriptive fields come from the primary listing.
CREATE TABLE jobs (
  id                 INTEGER PRIMARY KEY,
  primary_listing_id INTEGER,
  title              TEXT NOT NULL,
  company            TEXT,
  company_normalized TEXT,
  description_html   TEXT,
  description_text   TEXT,
  summary            TEXT,
  url                TEXT NOT NULL,
  canonical_url      TEXT,
  country            TEXT,
  region             TEXT,
  city               TEXT,
  location_raw       TEXT,
  remote_type        TEXT NOT NULL DEFAULT 'unknown',
  geo_eligibility    TEXT NOT NULL DEFAULT '[]', -- JSON array of GeoTag
  contract_types     TEXT NOT NULL DEFAULT '[]', -- JSON array of ContractType
  seniority          TEXT NOT NULL DEFAULT 'unknown',
  technologies       TEXT NOT NULL DEFAULT '[]', -- JSON array of strings
  language           TEXT,
  salary_min         REAL,
  salary_max         REAL,
  salary_currency    TEXT,
  salary_period      TEXT,
  identity_hash      TEXT,
  published_at       TEXT,          -- NULL when the source does not tell us
  first_seen_at      TEXT NOT NULL,
  last_seen_at       TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'active', -- active | possibly_closed
  score              INTEGER NOT NULL DEFAULT 0,
  score_breakdown    TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX idx_jobs_published_at ON jobs(published_at);
CREATE INDEX idx_jobs_first_seen_at ON jobs(first_seen_at);
CREATE INDEX idx_jobs_last_seen_at ON jobs(last_seen_at);
CREATE INDEX idx_jobs_score ON jobs(score);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_identity_hash ON jobs(identity_hash);
CREATE INDEX idx_jobs_company_normalized ON jobs(company_normalized);
CREATE INDEX idx_jobs_remote_type ON jobs(remote_type);
CREATE INDEX idx_jobs_seniority ON jobs(seniority);
CREATE INDEX idx_jobs_country ON jobs(country);

-- One occurrence of a job in one source. A job has 1..n listings.
CREATE TABLE job_listings (
  id               INTEGER PRIMARY KEY,
  job_id           INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  source           TEXT NOT NULL,
  source_job_id    TEXT NOT NULL,
  url              TEXT NOT NULL,
  canonical_url    TEXT,
  ats_key          TEXT,
  title            TEXT NOT NULL,
  company          TEXT,
  published_at     TEXT,
  first_seen_at    TEXT NOT NULL,
  last_seen_at     TEXT NOT NULL,
  missed_runs      INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'active',
  match_method     TEXT NOT NULL DEFAULT 'primary', -- primary | url | ats_id | identity | similarity | manual
  match_confidence REAL NOT NULL DEFAULT 1,
  content_hash     TEXT,
  UNIQUE (source, source_job_id)
);
CREATE INDEX idx_listings_job ON job_listings(job_id);
CREATE INDEX idx_listings_canonical_url ON job_listings(canonical_url);
CREATE INDEX idx_listings_ats_key ON job_listings(ats_key);
CREATE INDEX idx_listings_source_status ON job_listings(source, status);

-- Full-text search over consolidated jobs (external content table).
CREATE VIRTUAL TABLE jobs_fts USING fts5(
  title, company, description_text, technologies, location_raw,
  content='jobs', content_rowid='id', tokenize='unicode61 remove_diacritics 2'
);
CREATE TRIGGER jobs_ai AFTER INSERT ON jobs BEGIN
  INSERT INTO jobs_fts(rowid, title, company, description_text, technologies, location_raw)
  VALUES (new.id, new.title, new.company, new.description_text, new.technologies, new.location_raw);
END;
CREATE TRIGGER jobs_ad AFTER DELETE ON jobs BEGIN
  INSERT INTO jobs_fts(jobs_fts, rowid, title, company, description_text, technologies, location_raw)
  VALUES ('delete', old.id, old.title, old.company, old.description_text, old.technologies, old.location_raw);
END;
CREATE TRIGGER jobs_au AFTER UPDATE OF title, company, description_text, technologies, location_raw ON jobs BEGIN
  INSERT INTO jobs_fts(jobs_fts, rowid, title, company, description_text, technologies, location_raw)
  VALUES ('delete', old.id, old.title, old.company, old.description_text, old.technologies, old.location_raw);
  INSERT INTO jobs_fts(rowid, title, company, description_text, technologies, location_raw)
  VALUES (new.id, new.title, new.company, new.description_text, new.technologies, new.location_raw);
END;

-- Personal data, kept apart from captured data.
CREATE TABLE job_tracking (
  job_id      INTEGER PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  state       TEXT NOT NULL DEFAULT 'new',
  favorite    INTEGER NOT NULL DEFAULT 0,
  ignored     INTEGER NOT NULL DEFAULT 0,
  notes       TEXT NOT NULL DEFAULT '',
  applied_at  TEXT,
  recruiter   TEXT,
  process_url TEXT,
  updated_at  TEXT NOT NULL
);
CREATE INDEX idx_tracking_state ON job_tracking(state);
CREATE INDEX idx_tracking_favorite ON job_tracking(favorite);

CREATE TABLE job_state_history (
  id         INTEGER PRIMARY KEY,
  job_id     INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  field      TEXT NOT NULL,  -- state | favorite | ignored | notes | applied_at | recruiter | process_url
  old_value  TEXT,
  new_value  TEXT,
  changed_at TEXT NOT NULL
);
CREATE INDEX idx_history_job ON job_state_history(job_id, changed_at);

-- Possible duplicates below the auto-merge threshold, for manual review.
CREATE TABLE dedup_reviews (
  id               INTEGER PRIMARY KEY,
  job_id           INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  candidate_job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  confidence       REAL NOT NULL,
  method           TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending', -- pending | merged | dismissed
  created_at       TEXT NOT NULL,
  resolved_at      TEXT,
  UNIQUE (job_id, candidate_job_id)
);
CREATE INDEX idx_dedup_reviews_status ON dedup_reviews(status);

CREATE TABLE runs (
  id              INTEGER PRIMARY KEY,
  trigger         TEXT NOT NULL,  -- manual | scheduled | cli
  status          TEXT NOT NULL,  -- running | success | partial | failed | cancelled
  started_at      TEXT NOT NULL,
  finished_at     TEXT,
  duration_ms     INTEGER,
  sources_total   INTEGER NOT NULL DEFAULT 0,
  sources_done    INTEGER NOT NULL DEFAULT 0,
  sources_failed  INTEGER NOT NULL DEFAULT 0,
  jobs_found      INTEGER NOT NULL DEFAULT 0,
  jobs_new        INTEGER NOT NULL DEFAULT 0,
  jobs_updated    INTEGER NOT NULL DEFAULT 0,
  jobs_merged     INTEGER NOT NULL DEFAULT 0,
  error           TEXT
);
CREATE INDEX idx_runs_started_at ON runs(started_at);

CREATE TABLE run_sources (
  id            INTEGER PRIMARY KEY,
  run_id        INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  source        TEXT NOT NULL,
  status        TEXT NOT NULL, -- pending | running | success | failed | skipped | cancelled
  found         INTEGER NOT NULL DEFAULT 0,
  new           INTEGER NOT NULL DEFAULT 0,
  updated       INTEGER NOT NULL DEFAULT 0,
  merged        INTEGER NOT NULL DEFAULT 0,
  invalid       INTEGER NOT NULL DEFAULT 0,
  errors        INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  skip_reason   TEXT,
  attempts      INTEGER NOT NULL DEFAULT 0,
  started_at    TEXT,
  finished_at   TEXT,
  duration_ms   INTEGER
);
CREATE INDEX idx_run_sources_run ON run_sources(run_id);
CREATE INDEX idx_run_sources_source ON run_sources(source, started_at);

-- Live, per-source operational state (enable flag, last results, overrides).
CREATE TABLE source_state (
  source               TEXT PRIMARY KEY,
  enabled              INTEGER NOT NULL DEFAULT 1,
  last_run_at          TEXT,
  last_success_at      TEXT,
  last_status          TEXT,
  last_error           TEXT,
  last_found           INTEGER,
  last_new             INTEGER,
  last_duration_ms     INTEGER,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  min_interval_minutes INTEGER,  -- user override; never below the connector minimum
  max_requests         INTEGER   -- user override for requests per run
);

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL, -- JSON
  updated_at TEXT NOT NULL
);

CREATE TABLE saved_filters (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  query      TEXT NOT NULL, -- JSON JobsQuery
  created_at TEXT NOT NULL
);

CREATE TABLE http_cache (
  url           TEXT PRIMARY KEY,
  etag          TEXT,
  last_modified TEXT,
  status        INTEGER NOT NULL,
  content_type  TEXT,
  body          BLOB NOT NULL,
  fetched_at    TEXT NOT NULL
);

-- Persistent lock with expiry so a crashed process does not block forever.
CREATE TABLE locks (
  name        TEXT PRIMARY KEY,
  owner       TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);
