-- Vehicle Taxonomy V1: additive series/trim on Listing + UserFilter
-- Backward-compatible: nullable columns only; no DROP / truncate.

ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "series" TEXT;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "trim" TEXT;

ALTER TABLE "UserFilter" ADD COLUMN IF NOT EXISTS "series" TEXT;
ALTER TABLE "UserFilter" ADD COLUMN IF NOT EXISTS "trim" TEXT;

CREATE INDEX IF NOT EXISTS "Listing_brand_series_idx" ON "Listing"("brand", "series");
