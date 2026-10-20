-- 0002_listing_raw: keep each listing's raw payload so normalization fixes can be
-- re-applied offline (pnpm reprocess) without calling the sources again.
ALTER TABLE job_listings ADD COLUMN raw TEXT;
