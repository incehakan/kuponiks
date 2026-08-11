-- Market Intelligence V1: additive Listing market analysis fields + lastSeenAt index
-- Backward-compatible: all new columns nullable; no DROP / truncate / data rewrite.

ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "marketMedianPrice" DOUBLE PRECISION;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "marketSampleSize" INTEGER;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "marketConfidence" TEXT;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "marketDispersionPct" DOUBLE PRECISION;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "priceAdvantagePct" DOUBLE PRECISION;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "marketCalculatedAt" TIMESTAMP(3);
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "marketSegmentLevel" TEXT;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "marketStatus" TEXT;

CREATE INDEX IF NOT EXISTS "Listing_lastSeenAt_idx" ON "Listing"("lastSeenAt");
