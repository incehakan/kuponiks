import { arabamAdapter } from "./arabam.adapter.js";
import type { BaseScraperAdapter } from "./base.adapter.js";
import { hepsiemlakAdapter } from "./hepsiemlak.adapter.js";
import { letgoAdapter } from "./letgo.adapter.js";
import { sahibindenAdapter } from "./sahibinden.adapter.js";
import type { ScrapePlatform } from "../../queues/scraper.queue.js";

/**
 * Resolves a concrete adapter for a scrape platform.
 */
export function resolveScraperAdapter(
  platform: ScrapePlatform,
): BaseScraperAdapter | null {
  switch (platform) {
    case "arabam":
      return arabamAdapter;
    case "letgo":
      return letgoAdapter;
    case "sahibinden":
      return sahibindenAdapter;
    case "hepsiemlak":
      return hepsiemlakAdapter;
    case "generic":
      console.warn(
        `[SCRAPER] "${platform}" adaptörü henüz yok — job atlanacak`,
      );
      return null;
    default:
      return null;
  }
}
