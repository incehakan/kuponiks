import type { ScrapeQueryPlan } from "../scrape-query-plan.js";
import { brandSeriesQueryText } from "../scrape-query-plan.js";
import { buildArabamFilterParams } from "../arabam/arabam-filter-params.js";
import { buildArabamTaxonomyPath } from "../arabam/arabam-taxonomy.js";
import { resolveArabamTaxonomySlugs } from "../../../catalog/platform-taxonomy.service.js";
import { fieldRole } from "../platform-capabilities.js";

const ARABAM_BASE = "https://www.arabam.com";

export interface BuiltPlatformQuery {
  url: string;
  displayQuery: string;
  query: string;
  city?: string;
  category: string;
  appliedCriteria: string[];
  deferredCriteria: string[];
  sourceCriteria: Record<string, string | number>;
  sourceDebug?: {
    taxonomyPath: string | null;
    queryParams: Record<string, string>;
  };
}

function resolveDisplayQuery(plan: ScrapeQueryPlan): string {
  return brandSeriesQueryText({
    brand: plan.brand ?? null,
    series: plan.series ?? null,
    keywords: plan.keywords,
    category: plan.category,
  });
}

function isTurkeyWide(city: string | undefined): boolean {
  if (!city?.trim()) return true;
  const c = city.trim().toLocaleLowerCase("tr-TR");
  return c === "tüm türkiye" || c === "tum turkiye";
}

function buildSearchTextFallback(
  plan: ScrapeQueryPlan,
  take: number,
): BuiltPlatformQuery {
  const displayQuery = resolveDisplayQuery(plan);

  const params = new URLSearchParams();
  params.set("searchText", displayQuery);
  params.set("take", String(take));

  const url = `${ARABAM_BASE}/ikinci-el?${params.toString()}`;

  const sourceCriteria: Record<string, string | number> = {};
  const appliedCriteria: string[] = [];
  if (fieldRole("arabam", "keywords") === "SOURCE" && displayQuery) {
    sourceCriteria.keywords = displayQuery;
    appliedCriteria.push("keywords");
  }
  appliedCriteria.push("take");

  const deferredCriteria = plan.deferredCriteria.filter(
    (f) => !appliedCriteria.includes(f),
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
      taxonomyPath: null,
      queryParams: Object.fromEntries(params.entries()),
    },
  };
}

/**
 * Arabam Query Builder V2 — taxonomy path + verified query params.
 */
export function buildArabamQuery(plan: ScrapeQueryPlan): BuiltPlatformQuery {
  const take = 50;
  const hasBrand = Boolean(plan.brand?.trim());

  if (!hasBrand) {
    return buildSearchTextFallback(plan, take);
  }

  const cityApplied =
    fieldRole("arabam", "city") === "SOURCE" &&
    plan.city?.trim() &&
    !isTurkeyWide(plan.city);

  const taxonomyInput: Parameters<typeof buildArabamTaxonomyPath>[0] = {
    category: plan.category,
    brand: plan.brand!,
  };
  if (plan.series?.trim()) {
    taxonomyInput.series = plan.series;
  }
  if (cityApplied && plan.city) {
    taxonomyInput.city = plan.city;
  }

  const resolvedSlugs = resolveArabamTaxonomySlugs(plan.brand!, plan.series);
  if (resolvedSlugs) {
    taxonomyInput.slugOverride = {
      brandSlug: resolvedSlugs.brandSlug,
      ...(resolvedSlugs.seriesSlugPart
        ? { seriesSlugPart: resolvedSlugs.seriesSlugPart }
        : {}),
      modelSlug: resolvedSlugs.modelSlug,
    };
  }

  const taxonomyPath = buildArabamTaxonomyPath(taxonomyInput);

  if (!taxonomyPath) {
    return buildSearchTextFallback(plan, take);
  }

  const filterInput: Parameters<typeof buildArabamFilterParams>[0] = { take };
  if (fieldRole("arabam", "minYear") === "SOURCE" && plan.minYear != null) {
    filterInput.minYear = plan.minYear;
  }
  if (fieldRole("arabam", "maxYear") === "SOURCE" && plan.maxYear != null) {
    filterInput.maxYear = plan.maxYear;
  }
  if (fieldRole("arabam", "minPrice") === "SOURCE" && plan.minPrice != null) {
    filterInput.minPrice = plan.minPrice;
  }
  if (fieldRole("arabam", "maxPrice") === "SOURCE" && plan.maxPrice != null) {
    filterInput.maxPrice = plan.maxPrice;
  }

  const { params: queryParams } = buildArabamFilterParams(filterInput);
  const qs = new URLSearchParams(queryParams).toString();
  const url = `${ARABAM_BASE}${taxonomyPath}${qs ? `?${qs}` : ""}`;

  const displayQuery = resolveDisplayQuery(plan);

  const sourceCriteria: Record<string, string | number> = {};
  const appliedCriteria: string[] = [];

  if (fieldRole("arabam", "brand") === "SOURCE" && plan.brand) {
    sourceCriteria.brand = plan.brand;
    appliedCriteria.push("brand");
  }
  if (fieldRole("arabam", "series") === "SOURCE" && plan.series) {
    sourceCriteria.series = plan.series;
    appliedCriteria.push("series");
  }
  if (cityApplied && plan.city) {
    sourceCriteria.city = plan.city;
    appliedCriteria.push("city");
  }
  if (filterInput.minYear != null) {
    sourceCriteria.minYear = filterInput.minYear;
    appliedCriteria.push("minYear");
  }
  if (filterInput.maxYear != null) {
    sourceCriteria.maxYear = filterInput.maxYear;
    appliedCriteria.push("maxYear");
  }
  if (filterInput.minPrice != null) {
    sourceCriteria.minPrice = filterInput.minPrice;
    appliedCriteria.push("minPrice");
  }
  if (filterInput.maxPrice != null) {
    sourceCriteria.maxPrice = filterInput.maxPrice;
    appliedCriteria.push("maxPrice");
  }
  appliedCriteria.push("take");

  const deferredCriteria = plan.deferredCriteria.filter(
    (f) => !appliedCriteria.includes(f),
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
      taxonomyPath,
      queryParams,
    },
  };
}

export function buildArabamUrl(plan: ScrapeQueryPlan): string {
  return buildArabamQuery(plan).url;
}
