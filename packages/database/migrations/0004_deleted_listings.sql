-- 0004_deleted_listings: when the user deletes a job, remember its source listings so the next
-- capture does not bring it back (the source keeps publishing it).
CREATE TABLE deleted_listings (
  source        TEXT NOT NULL,
  source_job_id TEXT NOT NULL,
  title         TEXT,
  company       TEXT,
  deleted_at    TEXT NOT NULL,
  PRIMARY KEY (source, source_job_id)
);
