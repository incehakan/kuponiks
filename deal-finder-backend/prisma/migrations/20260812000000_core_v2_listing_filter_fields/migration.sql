-- Core V2: additive Listing + UserFilter normalized filter fields
-- Backward-compatible: all new columns nullable (or defaulted); existing rows remain valid.

-- UserFilter extensions
ALTER TABLE "UserFilter" ADD COLUMN IF NOT EXISTS "subcategory" TEXT;
ALTER TABLE "UserFilter" ADD COLUMN IF NOT EXISTS "brand" TEXT;
ALTER TABLE "UserFilter" ADD COLUMN IF NOT EXISTS "model" TEXT;
ALTER TABLE "UserFilter" ADD COLUMN IF NOT EXISTS "variant" TEXT;
ALTER TABLE "UserFilter" ADD COLUMN IF NOT EXISTS "minYear" INTEGER;
ALTER TABLE "UserFilter" ADD COLUMN IF NOT EXISTS "maxYear" INTEGER;
ALTER TABLE "UserFilter" ADD COLUMN IF NOT EXISTS "minMileage" INTEGER;
ALTER TABLE "UserFilter" ADD COLUMN IF NOT EXISTS "maxMileage" INTEGER;
ALTER TABLE "UserFilter" ADD COLUMN IF NOT EXISTS "district" TEXT;
ALTER TABLE "UserFilter" ADD COLUMN IF NOT EXISTS "fuelType" TEXT;
ALTER TABLE "UserFilter" ADD COLUMN IF NOT EXISTS "transmission" TEXT;
ALTER TABLE "UserFilter" ADD COLUMN IF NOT EXISTS "sellerType" TEXT;
ALTER TABLE "UserFilter" ADD COLUMN IF NOT EXISTS "excludedKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Listing extensions
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "subcategory" TEXT;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "brand" TEXT;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "model" TEXT;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "variant" TEXT;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "year" INTEGER;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "mileage" INTEGER;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "fuelType" TEXT;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "transmission" TEXT;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "district" TEXT;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "sellerType" TEXT;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "currency" TEXT DEFAULT 'TRY';
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3);
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Safe backfill: only copy category from rawDetails when present and column empty
UPDATE "Listing"
SET "category" = COALESCE(
  NULLIF(TRIM("rawDetails"->>'category'), ''),
  NULLIF(TRIM("rawDetails"->>'kategori'), '')
)
WHERE "category" IS NULL
  AND "rawDetails" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "UserFilter_isActive_brand_model_idx" ON "UserFilter"("isActive", "brand", "model");
CREATE INDEX IF NOT EXISTS "Listing_category_subcategory_idx" ON "Listing"("category", "subcategory");
CREATE INDEX IF NOT EXISTS "Listing_brand_model_idx" ON "Listing"("brand", "model");
CREATE INDEX IF NOT EXISTS "Listing_city_price_idx" ON "Listing"("city", "price");
CREATE INDEX IF NOT EXISTS "Listing_year_idx" ON "Listing"("year");
CREATE INDEX IF NOT EXISTS "Listing_firstSeenAt_idx" ON "Listing"("firstSeenAt");
