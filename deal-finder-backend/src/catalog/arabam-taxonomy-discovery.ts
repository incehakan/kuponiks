import {
  ARABAM_COMPOUND_BRAND_SLUGS,
  isAllowedCatalogSeries,
  isGarbageBrandSlug,
} from "./catalog-source-rules.js";
import {
  slugifyArabamBrand,
  slugifyArabamSeries,
} from "../scraper/query/arabam/arabam-slug.js";

export interface ArabamDiscoveredBrand {
  sourceSlug: string;
  sourceLabel: string;
  path: string;
}

export interface ArabamDiscoveredSeries {
  brandSlug: string;
  sourceSlug: string;
  seriesSlugPart: string;
  sourceLabel: string;
  path: string;
}

const ARABAM_BASE = "https://www.arabam.com";
const ARABAM_OTOMOBIL = "/ikinci-el/otomobil";
const FETCH_TIMEOUT_MS = 20_000;
const FETCH_RETRIES = 3;
const SERIES_PAGE_DELAY_MS = 700;

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
};

export interface DiscoveryFetchStats {
  requestCount: number;
  failureCount: number;
  failedPaths: string[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchArabamHtml(path: string): Promise<string> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= FETCH_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(`${ARABAM_BASE}${path}`, {
        headers: FETCH_HEADERS,
        signal: controller.signal,
        redirect: "follow",
      });
      if (res.status === 404) {
        return "";
      }
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`Arabam fetch failed ${res.status} for ${path}`);
      }
      if (!res.ok) {
        throw new Error(`Arabam fetch failed ${res.status} for ${path}`);
      }
      return await res.text();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < FETCH_RETRIES) {
        await sleep(800 * attempt);
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error(`Arabam fetch failed for ${path}`);
}

export function extractBrandSlugs(allSlugs: Iterable<string>): string[] {
  const slugs = [...new Set(allSlugs)];
  return slugs.filter((slug) => {
    if (isGarbageBrandSlug(slug)) {
      return false;
    }
    if (ARABAM_COMPOUND_BRAND_SLUGS.has(slug)) {
      return true;
    }
    const parent = slugs.find(
      (other) => other !== slug && slug.startsWith(`${other}-`),
    );
    return parent == null;
  });
}

export function extractBrandEntries(html: string): ArabamDiscoveredBrand[] {
  const re =
    /href=["'](\/ikinci-el\/otomobil\/[a-z0-9-]+)["'][^>]*>([^<]{1,80})</gi;
  const bySlug = new Map<string, string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const path = m[1]!;
    const slug = path.slice(`${ARABAM_OTOMOBIL}/`.length);
    const label = m[2]!.replace(/\s+/g, " ").trim();
    if (!bySlug.has(slug) && label) {
      bySlug.set(slug, label);
    }
  }

  const hrefOnly = /href=["'](\/ikinci-el\/otomobil\/[a-z0-9-]+)["']/gi;
  while ((m = hrefOnly.exec(html)) !== null) {
    const slug = m[1]!.slice(`${ARABAM_OTOMOBIL}/`.length);
    if (!bySlug.has(slug)) {
      bySlug.set(slug, slug);
    }
  }

  return extractBrandSlugs(bySlug.keys())
    .sort()
    .map((slug) => ({
      sourceSlug: slug,
      sourceLabel: bySlug.get(slug) ?? slug,
      path: `${ARABAM_OTOMOBIL}/${slug}`,
    }));
}

export function extractBrandPaths(html: string): string[] {
  return extractBrandEntries(html).map((b) => b.path);
}

export function extractSeriesPaths(html: string, brandSlug: string): string[] {
  const prefix = `${ARABAM_OTOMOBIL}/${brandSlug}-`;
  const re = new RegExp(`href=["'](${prefix}[a-z0-9-]+)["']`, "gi");
  const paths = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const path = m[1]!;
    const fullSlug = path.slice(`${ARABAM_OTOMOBIL}/`.length);
    const seriesPart = fullSlug.slice(brandSlug.length + 1);
    if (!isAllowedCatalogSeries(seriesPart)) {
      continue;
    }
    paths.add(path);
  }
  return [...paths].sort();
}

export async function discoverArabamBrands(options?: {
  limitBrands?: number;
  brandFilter?: string;
  brandSlugs?: string[];
  stats?: DiscoveryFetchStats;
}): Promise<ArabamDiscoveredBrand[]> {
  const stats = options?.stats;
  if (stats) {
    stats.requestCount += 1;
  }
  const indexHtml = await fetchArabamHtml(ARABAM_OTOMOBIL);
  let brands = extractBrandEntries(indexHtml);

  if (options?.brandSlugs?.length) {
    const allowed = new Set(options.brandSlugs.map((s) => s.toLowerCase()));
    brands = brands.filter((b) => allowed.has(b.sourceSlug));
  } else if (options?.brandFilter) {
    const filter = options.brandFilter.toLocaleLowerCase("tr-TR");
    brands = brands.filter(
      (b) =>
        b.sourceSlug === filter ||
        b.sourceLabel.toLocaleLowerCase("tr-TR") === filter,
    );
  } else if (options?.limitBrands != null) {
    brands = brands.slice(0, options.limitBrands);
  }

  return brands;
}

export async function discoverArabamSeriesForBrand(
  brand: ArabamDiscoveredBrand,
  options?: {
    filterSeries?: (seriesPart: string, fullSlug: string) => boolean;
    stats?: DiscoveryFetchStats;
  },
): Promise<ArabamDiscoveredSeries[]> {
  await sleep(SERIES_PAGE_DELAY_MS);
  const stats = options?.stats;
  if (stats) {
    stats.requestCount += 1;
  }
  let html = "";
  try {
    html = await fetchArabamHtml(brand.path);
  } catch (error) {
    if (stats) {
      stats.failureCount += 1;
      stats.failedPaths.push(brand.path);
    }
    throw error;
  }
  const paths = extractSeriesPaths(html, brand.sourceSlug);
  const out: ArabamDiscoveredSeries[] = [];

  for (const path of paths) {
    const fullSlug = path.slice(`${ARABAM_OTOMOBIL}/`.length);
    const seriesPart = fullSlug.slice(brand.sourceSlug.length + 1);
    if (options?.filterSeries && !options.filterSeries(seriesPart, fullSlug)) {
      continue;
    }
    out.push({
      brandSlug: brand.sourceSlug,
      sourceSlug: fullSlug,
      seriesSlugPart: seriesPart,
      sourceLabel: seriesPart,
      path,
    });
  }
  return out;
}

/** Derive Arabam path slugs from canonical brand/series (fallback when no alias). */
export function deriveArabamSlugsFromCanonical(
  brand: string,
  series?: string,
): { brandSlug: string; seriesSlugPart?: string; modelSlug: string } | null {
  const brandSlug = slugifyArabamBrand(brand);
  if (!brandSlug) {
    return null;
  }
  let modelSlug = brandSlug;
  if (series?.trim()) {
    const seriesSlugPart = slugifyArabamSeries(series);
    if (seriesSlugPart) {
      modelSlug = `${brandSlug}-${seriesSlugPart}`;
      return { brandSlug, seriesSlugPart, modelSlug };
    }
  }
  return { brandSlug, modelSlug };
}
