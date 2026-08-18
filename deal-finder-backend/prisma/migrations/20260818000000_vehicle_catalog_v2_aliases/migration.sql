-- Vehicle Catalog V2 — platform alias/source mapping (additive only)

CREATE TABLE "VehicleBrandAlias" (
    "id" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "sourceLabel" TEXT NOT NULL,
    "normalizedSource" TEXT NOT NULL,
    "sourceSlug" TEXT NOT NULL,
    "brandId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleBrandAlias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VehicleBrandAlias_platform_normalizedSource_key" ON "VehicleBrandAlias"("platform", "normalizedSource");
CREATE UNIQUE INDEX "VehicleBrandAlias_platform_sourceSlug_key" ON "VehicleBrandAlias"("platform", "sourceSlug");
CREATE INDEX "VehicleBrandAlias_brandId_idx" ON "VehicleBrandAlias"("brandId");

CREATE TABLE "VehicleSeriesAlias" (
    "id" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "sourceLabel" TEXT NOT NULL,
    "normalizedSource" TEXT NOT NULL,
    "sourceSlug" TEXT NOT NULL,
    "brandId" UUID NOT NULL,
    "seriesId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleSeriesAlias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VehicleSeriesAlias_platform_sourceSlug_key" ON "VehicleSeriesAlias"("platform", "sourceSlug");
CREATE UNIQUE INDEX "VehicleSeriesAlias_platform_brandId_normalizedSource_key" ON "VehicleSeriesAlias"("platform", "brandId", "normalizedSource");
CREATE INDEX "VehicleSeriesAlias_seriesId_idx" ON "VehicleSeriesAlias"("seriesId");

ALTER TABLE "VehicleBrandAlias" ADD CONSTRAINT "VehicleBrandAlias_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "VehicleBrand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VehicleSeriesAlias" ADD CONSTRAINT "VehicleSeriesAlias_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "VehicleBrand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VehicleSeriesAlias" ADD CONSTRAINT "VehicleSeriesAlias_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "VehicleSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
