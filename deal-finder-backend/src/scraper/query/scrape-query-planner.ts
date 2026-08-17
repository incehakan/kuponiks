import type { ScrapePlatform } from "../../queues/scraper.queue.js";
import type { BuiltPlatformQuery } from "./planners/arabam-query-builder.js";
import { buildArabamQuery } from "./planners/arabam-query-builder.js";
import { buildLetgoQuery } from "./planners/letgo-query-builder.js";
import { buildSahibindenQuery } from "./planners/sahibinden-query-builder.js";
import {
  planFromFilter,
  type SchedulerFilterInput,
  type ScrapeQueryPlan,
} from "./scrape-query-plan.js";

export function buildPlatformQuery(
  platform: ScrapePlatform,
  filter: SchedulerFilterInput,
): { plan: ScrapeQueryPlan; built: BuiltPlatformQuery } {
  const plan = planFromFilter(platform, filter);
  const built = buildPlatformQueryFromPlan(plan);
  return { plan, built };
}

export function buildPlatformQueryFromPlan(
  plan: ScrapeQueryPlan,
): BuiltPlatformQuery {
  switch (plan.platform) {
    case "arabam":
      return buildArabamQuery(plan);
    case "letgo":
      return buildLetgoQuery(plan);
    case "sahibinden":
      return buildSahibindenQuery(plan);
    default:
      return buildLetgoQuery(plan);
  }
}

export type { BuiltPlatformQuery, ScrapeQueryPlan, SchedulerFilterInput };
