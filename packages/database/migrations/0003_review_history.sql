-- 0003_review_history: merging a pair deletes the absorbed job; the review row must survive
-- as a record of the decision, so job references become nullable (ON DELETE SET NULL) and the
-- absorbed job's title/company are kept as a snapshot.
CREATE TABLE dedup_reviews_new (
  id               INTEGER PRIMARY KEY,
  job_id           INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
  candidate_job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
  confidence       REAL NOT NULL,
  method           TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending', -- pending | merged | dismissed
  created_at       TEXT NOT NULL,
  resolved_at      TEXT,
  kept_job_id      INTEGER,
  merged_title     TEXT,
  merged_company   TEXT,
  UNIQUE (job_id, candidate_job_id)
);
INSERT INTO dedup_reviews_new (id, job_id, candidate_job_id, confidence, method, status, created_at, resolved_at)
  SELECT id, job_id, candidate_job_id, confidence, method, status, created_at, resolved_at FROM dedup_reviews;
DROP TABLE dedup_reviews;
ALTER TABLE dedup_reviews_new RENAME TO dedup_reviews;
CREATE INDEX idx_dedup_reviews_status ON dedup_reviews(status);
CREATE INDEX idx_dedup_reviews_job ON dedup_reviews(job_id);
CREATE INDEX idx_dedup_reviews_candidate ON dedup_reviews(candidate_job_id);
