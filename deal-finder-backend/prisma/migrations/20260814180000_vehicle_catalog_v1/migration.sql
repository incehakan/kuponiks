-- Vehicle Catalog V1: master brand/series/trim independent of Listing.
-- Additive only: CREATE TABLE / INDEX / FK. No DROP / TRUNCATE / DELETE.

CREATE TABLE "VehicleBrand" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleBrand_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VehicleBrand_normalizedName_key" ON "VehicleBrand"("normalizedName");
CREATE INDEX "VehicleBrand_isActive_name_idx" ON "VehicleBrand"("isActive", "name");

CREATE TABLE "VehicleSeries" (
    "id" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleSeries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VehicleSeries_brandId_normalizedName_key" ON "VehicleSeries"("brandId", "normalizedName");
CREATE INDEX "VehicleSeries_brandId_isActive_idx" ON "VehicleSeries"("brandId", "isActive");

CREATE TABLE "VehicleTrim" (
    "id" UUID NOT NULL,
    "seriesId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleTrim_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VehicleTrim_seriesId_normalizedName_key" ON "VehicleTrim"("seriesId", "normalizedName");
CREATE INDEX "VehicleTrim_seriesId_isActive_idx" ON "VehicleTrim"("seriesId", "isActive");

ALTER TABLE "VehicleSeries" ADD CONSTRAINT "VehicleSeries_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "VehicleBrand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VehicleTrim" ADD CONSTRAINT "VehicleTrim_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "VehicleSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
