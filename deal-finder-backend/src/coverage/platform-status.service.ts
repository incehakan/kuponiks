import { prisma } from "../lib/prisma.js";
import type { ScrapePlatform } from "../queues/scraper.queue.js";
import {
  loadPlatformRuntimeSnapshots,
} from "./platform-availability.js";
import type { PlatformRuntimeSnapshot } from "./coverage-types.js";

export interface PlatformFieldCompleteness {
  platform: string;
  listings: number;
  brand: number | null;
  series: number | null;
  year: number | null;
  mileage: number | null;
  price: number | null;
  city: number | null;
  imageUrl: number | null;
}

export interface PlatformStatusReport {
  snapshots: Record<"arabam" | "letgo" | "sahibinden", PlatformRuntimeSnapshot>;
  completeness: PlatformFieldCompleteness[];
}

export async function measureListingCompleteness(
  platforms: ScrapePlatform[] = ["arabam", "letgo", "sahibinden"],
): Promise<PlatformFieldCompleteness[]> {
  const rows = await Promise.all(
    platforms.map(async (platform) => {
      const [listings, brand, series, year, mileage, price, city, imageUrl] =
        await Promise.all([
          prisma.listing.count({ where: { platform } }),
          prisma.listing.count({
            where: { platform, brand: { not: null }, NOT: { brand: "" } },
          }),
          prisma.listing.count({
            where: { platform, series: { not: null }, NOT: { series: "" } },
          }),
          prisma.listing.count({ where: { platform, year: { not: null } } }),
          prisma.listing.count({ where: { platform, mileage: { not: null } } }),
          prisma.listing.count({ where: { platform, price: { gt: 0 } } }),
          prisma.listing.count({
            where: { platform, city: { not: null }, NOT: { city: "" } },
          }),
          prisma.listing.count({
            where: {
              platform,
              imageUrl: { not: null },
              NOT: { imageUrl: "" },
            },
          }),
        ]);
      return {
        platform,
        listings,
        brand: listings === 0 ? null : brand,
        series: listings === 0 ? null : series,
        year: listings === 0 ? null : year,
        mileage: listings === 0 ? null : mileage,
        price: listings === 0 ? null : price,
        city: listings === 0 ? null : city,
        imageUrl: listings === 0 ? null : imageUrl,
      };
    }),
  );
  return rows;
}

export async function getPlatformStatusReport(): Promise<PlatformStatusReport> {
  const [snapshots, completeness] = await Promise.all([
    loadPlatformRuntimeSnapshots(),
    measureListingCompleteness(),
  ]);
  return { snapshots, completeness };
}
