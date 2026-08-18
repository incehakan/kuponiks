import {
  isArabamSeriesFacetSlug,
  isArabamSeriesNoiseSlug,
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

const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; KuponiksCatalogSync/1.0)",
  "Accept-Language": "tr-TR,tr;q=0.9",
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchArabamHtml(path: string): Promise<string> {
  const res = await fetch(`${ARABAM_BASE}${path}`, { headers: FETCH_HEADERS });
  if (!res.ok) {
    throw new Error(`Arabam fetch failed ${res.status} for ${path}`);
  }
  return res.text();
}

export function extractBrandPaths(html: string): string[] {
  const re = /href="(\/ikinci-el\/otomobil\/[a-z0-9-]+)"/gi;
  const allSlugs = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    allSlugs.add(m[1]!.slice(`${ARABAM_OTOMOBIL}/`.length));
  }

  const singleWordBrands = new Set(
    [...allSlugs].filter((slug) => !slug.includes("-")),
  );

  const paths = new Set<string>();
  for (const slug of allSlugs) {
    const isSeriesLink = [...singleWordBrands].some(
      (brand) => slug.startsWith(`${brand}-`) && slug.length > brand.length + 1,
    );
    if (!isSeriesLink) {
      paths.add(`${ARABAM_OTOMOBIL}/${slug}`);
    }
  }
  return [...paths].sort();
}

export function extractSeriesPaths(html: string, brandSlug: string): string[] {
  const prefix = `${ARABAM_OTOMOBIL}/${brandSlug}-`;
  const re = new RegExp(`href="(${prefix}[a-z0-9-]+)"`, "gi");
  const paths = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const path = m[1]!;
    const fullSlug = path.slice(`${ARABAM_OTOMOBIL}/`.length);
    const seriesPart = fullSlug.slice(brandSlug.length + 1);
    if (isArabamSeriesNoiseSlug(seriesPart) || isArabamSeriesFacetSlug(seriesPart)) {
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
}): Promise<ArabamDiscoveredBrand[]> {
  const indexHtml = await fetchArabamHtml(ARABAM_OTOMOBIL);
  let paths = extractBrandPaths(indexHtml);

  if (options?.brandSlugs?.length) {
    const allowed = new Set(options.brandSlugs.map((s) => s.toLowerCase()));
    paths = paths.filter((p) => allowed.has(p.split("/").pop() ?? ""));
  } else if (options?.brandFilter) {
    const filter = options.brandFilter.toLocaleLowerCase("tr-TR");
    paths = paths.filter((p) => p.endsWith(`/${filter}`));
  } else if (options?.limitBrands != null) {
    paths = paths.slice(0, options.limitBrands);
  }

  const brands: ArabamDiscoveredBrand[] = [];
  for (const path of paths) {
    await sleep(400);
    const slug = path.slice(`${ARABAM_OTOMOBIL}/`.length);
    const html = await fetchArabamHtml(path);
    const titleLabel =
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.split(" Fiyatları")[0]?.trim() ??
      slug;
    brands.push({
      sourceSlug: slug,
      sourceLabel: titleLabel.replace(/\s*-\s*arabam.*$/i, "").trim(),
      path,
    });
  }
  return brands;
}

export async function discoverArabamSeriesForBrand(
  brand: ArabamDiscoveredBrand,
  options?: {
    filterSeries?: (seriesPart: string, fullSlug: string) => boolean;
  },
): Promise<ArabamDiscoveredSeries[]> {
  await sleep(400);
  const html = await fetchArabamHtml(brand.path);
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
