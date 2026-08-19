import type { ScrapeQueryPlan } from "../scrape-query-plan.js";
import { brandSeriesQueryText } from "../scrape-query-plan.js";
import type { BuiltPlatformQuery } from "./arabam-query-builder.js";
import { otoplusBrandSeriesPath } from "../../parsers/otoplus.parser.js";
import { fieldRole } from "../platform-capabilities.js";

const BASE = "https://www.otoplus.com";

export function buildOtoplusQuery(plan: ScrapeQueryPlan): BuiltPlatformQuery {
  const displayQuery = brandSeriesQueryText({
    brand: plan.brand ?? null,
    series: plan.series ?? null,
    keywords: plan.keywords,
    category: plan.category,
  });
  const path = otoplusBrandSeriesPath(plan.brand, plan.series);
  const url = path ? `${BASE}${path}` : `${BASE}/al`;
  const appliedCriteria: string[] = [];
  const sourceCriteria: Record<string, string | number> = {};
  if (fieldRole("otoplus", "brand") === "SOURCE" && plan.brand) {
    appliedCriteria.push("brand");
    sourceCriteria.brand = plan.brand;
  }
  if (fieldRole("otoplus", "series") === "SOURCE" && plan.series) {
    appliedCriteria.push("series");
    sourceCriteria.series = plan.series;
  }
  const deferredCriteria = plan.deferredCriteria.filter(
    (field) => !appliedCriteria.includes(field),
  );
  return {
    url,
    displayQuery,
    query: displayQuery,
    category: plan.category,
    appliedCriteria,
    deferredCriteria,
    sourceCriteria,
    sourceDebug: {
      taxonomyPath: path,
      queryParams: {},
    },
  };
}
