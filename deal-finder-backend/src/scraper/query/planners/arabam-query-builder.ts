import type { ScrapeQueryPlan } from "../scrape-query-plan.js";
import { brandSeriesQueryText } from "../scrape-query-plan.js";

export interface BuiltPlatformQuery {
  url: string;
  displayQuery: string;
  /** Legacy adapter `query` param (brand+series or keyword). */
  query: string;
  /** City passed to adapter when platform supports SOURCE city. */
  city?: string;
  category: string;
  appliedCriteria: string[];
  deferredCriteria: string[];
  sourceCriteria: Record<string, string | number>;
}

const DEFAULT_TAKE = 50;

/**
 * Arabam search URL — verified live adapter shape only:
 * https://www.arabam.com/ikinci-el?searchText={brand series}&take=50
 *
 * No year/price/mileage/city params (not verified on search URL).
 */
export function buildArabamQuery(plan: ScrapeQueryPlan): BuiltPlatformQuery {
  const displayQuery = brandSeriesQueryText({
    brand: plan.brand ?? null,
    series: plan.series ?? null,
    keywords: plan.keywords,
    category: plan.category,
  });

  const url = new URL("https://www.arabam.com/ikinci-el");
  if (displayQuery) {
    url.searchParams.set("searchText", displayQuery);
  }
  url.searchParams.set("take", String(DEFAULT_TAKE));

  const appliedCriteria = [...plan.appliedCriteria];
  const deferredCriteria = plan.deferredCriteria.filter(
    (field) => !appliedCriteria.includes(field),
  );

  return {
    url: url.toString(),
    displayQuery,
    query: displayQuery,
    category: plan.category,
    appliedCriteria,
    deferredCriteria,
    sourceCriteria: { ...plan.sourceCriteria },
  };
}
