import type { ScrapeQueryPlan } from "../scrape-query-plan.js";
import { brandSeriesQueryText } from "../scrape-query-plan.js";
import type { BuiltPlatformQuery } from "./arabam-query-builder.js";

/** Sahibinden search URL — mirrors existing sahibinden.adapter buildSearchUrl. */
export function buildSahibindenQuery(plan: ScrapeQueryPlan): BuiltPlatformQuery {
  const keyword =
    brandSeriesQueryText({
      brand: plan.brand ?? null,
      series: plan.series ?? null,
      keywords: plan.keywords,
      category: plan.category,
    }) || plan.category.trim();

  const categoryLower = plan.category.toLocaleLowerCase("tr-TR");
  let search: URL;

  if (
    categoryLower.includes("otomobil") ||
    categoryLower.includes("vasıta") ||
    categoryLower.includes("vasita")
  ) {
    search = new URL("https://www.sahibinden.com/otomobil");
  } else {
    search = new URL("https://www.sahibinden.com/arama");
  }

  if (keyword) {
    search.searchParams.set("query_text", keyword);
    if (!categoryLower.includes("otomobil")) {
      search.searchParams.set("query", keyword);
    }
  }
  if (plan.city?.trim()) {
    search.searchParams.set("address_city", plan.city.trim());
  }

  return {
    url: search.toString(),
    displayQuery: keyword,
    query: keyword,
    ...(plan.city ? { city: plan.city } : {}),
    category: plan.category,
    appliedCriteria: [...plan.appliedCriteria],
    deferredCriteria: plan.deferredCriteria.filter(
      (field) => !plan.appliedCriteria.includes(field),
    ),
    sourceCriteria: { ...plan.sourceCriteria },
  };
}
