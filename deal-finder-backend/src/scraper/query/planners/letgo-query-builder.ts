import type { ScrapeQueryPlan } from "../scrape-query-plan.js";
import { brandSeriesQueryText } from "../scrape-query-plan.js";
import type { BuiltPlatformQuery } from "./arabam-query-builder.js";
import { fieldRole } from "../platform-capabilities.js";
import {
  LETGO_CAR_CATEGORY_ID,
  LETGO_ORIGIN,
  LETGO_SEARCH_ITEMS_PATH,
  letgoFilterSlug,
} from "../../parsers/letgo.parser.js";

function isVehicleCategory(category: string): boolean {
  const c = category.toLocaleLowerCase("tr-TR");
  return (
    c.includes("vasıta") ||
    c.includes("vasita") ||
    c.includes("otomobil") ||
    c.includes("araba") ||
    c.includes("suv")
  );
}

/**
 * Letgo public search contract (verified Aug 2026):
 * GET https://www.letgo.com/api/search/items
 *   category_id=15706
 *   filter=marka:{slug};model:{slug}
 * Pagination: metadata.next_page_url (search_after cursor).
 */
export function buildLetgoQuery(plan: ScrapeQueryPlan): BuiltPlatformQuery {
  const displayQuery = brandSeriesQueryText({
    brand: plan.brand ?? null,
    series: plan.series ?? null,
    keywords: plan.keywords,
    category: plan.category,
  });

  const params = new URLSearchParams();
  const sourceDebugParams: Record<string, string> = {};
  const appliedCriteria: string[] = [];
  const sourceCriteria: Record<string, string | number> = {};

  if (isVehicleCategory(plan.category)) {
    params.set("category_id", LETGO_CAR_CATEGORY_ID);
    sourceDebugParams.category_id = LETGO_CAR_CATEGORY_ID;
    if (fieldRole("letgo", "category") === "SOURCE") {
      appliedCriteria.push("category");
      sourceCriteria.category = plan.category;
    }
  }

  const brandSlug =
    fieldRole("letgo", "brand") === "SOURCE" && plan.brand
      ? letgoFilterSlug(plan.brand)
      : "";
  const seriesSlug =
    fieldRole("letgo", "series") === "SOURCE" && plan.series
      ? letgoFilterSlug(plan.series)
      : "";

  const filterParts: string[] = [];
  if (brandSlug) {
    filterParts.push(`marka:${brandSlug}`);
    appliedCriteria.push("brand");
    sourceCriteria.brand = plan.brand!;
  }
  if (seriesSlug) {
    filterParts.push(`model:${seriesSlug}`);
    appliedCriteria.push("series");
    sourceCriteria.series = plan.series!;
  }

  if (filterParts.length > 0) {
    const filter = filterParts.join(";");
    params.set("filter", filter);
    sourceDebugParams.filter = filter;
  } else if (displayQuery && displayQuery !== plan.category) {
    params.set("q", displayQuery);
    sourceDebugParams.q = displayQuery;
    if (fieldRole("letgo", "keywords") === "SOURCE") {
      appliedCriteria.push("keywords");
      sourceCriteria.keywords = displayQuery;
    }
  }

  params.set("sorting", "desc-relevance");
  sourceDebugParams.sorting = "desc-relevance";

  const url = `${LETGO_ORIGIN}${LETGO_SEARCH_ITEMS_PATH}?${params.toString()}`;
  const deferredCriteria = plan.deferredCriteria.filter(
    (field) => !appliedCriteria.includes(field),
  );

  return {
    url,
    displayQuery,
    query: displayQuery,
    ...(plan.city ? { city: plan.city } : {}),
    category: plan.category,
    appliedCriteria,
    deferredCriteria,
    sourceCriteria,
    sourceDebug: {
      taxonomyPath: `/araba-${LETGO_CAR_CATEGORY_ID}_c${LETGO_CAR_CATEGORY_ID}`,
      queryParams: sourceDebugParams,
    },
  };
}
