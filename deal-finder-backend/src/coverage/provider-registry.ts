import type { ScrapePlatform } from "../queues/scraper.queue.js";

/**
 * Central discovery lists. Coverage, scheduler, and reliability read these
 * instead of duplicating platform arrays.
 */
export const VEHICLE_DISCOVERY_PLATFORMS: readonly ScrapePlatform[] = [
  "arabam",
  "otoplus",
  "letgo",
  "sahibinden",
];

export const REALTY_DISCOVERY_PLATFORMS: readonly ScrapePlatform[] = [
  "hepsiemlak",
  "sahibinden",
];

export const ALL_DISCOVERY_PLATFORMS: readonly ScrapePlatform[] = [
  "sahibinden",
  "arabam",
  "otoplus",
  "letgo",
  "hepsiemlak",
];

export function isVehicleDiscoveryPlatform(
  platform: ScrapePlatform,
): boolean {
  return (VEHICLE_DISCOVERY_PLATFORMS as readonly string[]).includes(platform);
}
