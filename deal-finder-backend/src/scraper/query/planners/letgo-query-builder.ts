import type { ScrapeQueryPlan } from "../scrape-query-plan.js";
import { brandSeriesQueryText } from "../scrape-query-plan.js";
import type { BuiltPlatformQuery } from "./arabam-query-builder.js";

/** Letgo search URL — mirrors existing letgo.adapter buildSearchUrl. */
export function buildLetgoQuery(plan: ScrapeQueryPlan): BuiltPlatformQuery {
  const displayQuery = brandSeriesQueryText({
    brand: plan.brand ?? null,
    series: plan.series ?? null,
    keywords: plan.keywords,
    category: plan.category,
  });

  const search = new URL("https://www.letgo.com/tr-tr");
  const qParts = [displayQuery, plan.category, plan.city]
    .map((part) => part?.trim())
    .filter(Boolean);

  if (qParts.length > 0) {
    const joined = qParts.join(" ");
    search.searchParams.set("search", joined);
    search.searchParams.set("q", joined);
  }
  if (plan.city?.trim()) {
    search.searchParams.set("city", plan.city.trim());
  }
  if (plan.category.trim()) {
    search.searchParams.set("category", plan.category.trim());
  }

  return {
    url: search.toString(),
    displayQuery,
    query: displayQuery,
    ...(plan.city ? { city: plan.city } : {}),
    category: plan.category,
    appliedCriteria: [...plan.appliedCriteria],
    deferredCriteria: plan.deferredCriteria.filter(
      (field) => !plan.appliedCriteria.includes(field),
    ),
    sourceCriteria: { ...plan.sourceCriteria },
  };
}
