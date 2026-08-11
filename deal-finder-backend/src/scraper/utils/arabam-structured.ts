/**
 * Arabam structured metadata helpers (JSON-LD Vehicle + deterministic URL taxonomy).
 * No title-regex brand/mileage/series guessing.
 */

export interface ArabamLdVehicle {
  url: string | null;
  brand: string | null;
  manufacturer: string | null;
  /** schema.org Vehicle.model when present (series-level when short taxonomy token). */
  model: string | null;
  mileage: number | null;
  year: number | null;
  transmission: string | null;
  fuelType: string | null;
  sellerType: string | null;
  brandSource: "json-ld" | null;
  mileageSource: "json-ld" | null;
  modelSource: "json-ld" | null;
}

export interface ArabamUrlTaxonomy {
  brand: string | null;
  /** Second taxonomy slug after brand when present (e.g. honda-civic → Civic). */
  series: string | null;
  sellerType: string | null;
  brandSource: "url-taxonomy" | null;
  seriesSource: "url-taxonomy" | null;
}

export interface ArabamSeriesTrimResolution {
  series: string | null;
  trim: string | null;
  seriesSource: "url-taxonomy" | "json-ld" | "legacy-model" | null;
  trimSource: "dom-model" | null;
}

const ARABAM_URL_TAXONOMY =
  /^https?:\/\/(?:www\.)?arabam\.com\/ilan\/(galeriden|sahibinden)-(satilik|kiralik)-([a-z0-9]+)(?:-([a-z0-9]+))?/i;

/**
 * Brand (+ optional series) from Arabam listing URL taxonomy:
 * /ilan/{seller}-{sale}-{brand}[-{series}]/...
 * Rejects free-form title slugs.
 */
export function parseArabamUrlTaxonomy(
  url: string | null | undefined,
): ArabamUrlTaxonomy {
  if (!url?.trim()) {
    return {
      brand: null,
      series: null,
      sellerType: null,
      brandSource: null,
      seriesSource: null,
    };
  }

  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return {
      brand: null,
      series: null,
      sellerType: null,
      brandSource: null,
      seriesSource: null,
    };
  }

  const match = pathname.match(
    /^\/ilan\/(galeriden|sahibinden)-(satilik|kiralik)-([a-z0-9]+)(?:-([a-z0-9]+))?(?:-|\/|$)/i,
  );
  if (!match) {
    return {
      brand: null,
      series: null,
      sellerType: null,
      brandSource: null,
      seriesSource: null,
    };
  }

  const sellerRaw = match[1]!.toLocaleLowerCase("tr-TR");
  const brandSlug = match[3]!.toLocaleLowerCase("tr-TR");
  const seriesSlug = match[4]?.toLocaleLowerCase("tr-TR") ?? null;
  const sellerType =
    sellerRaw === "galeriden" ? "Galeriden" : "Sahibinden";

  if (!brandSlug || brandSlug.length < 2 || /^\d+$/.test(brandSlug)) {
    return {
      brand: null,
      series: null,
      sellerType,
      brandSource: null,
      seriesSource: null,
    };
  }

  const series = seriesSlug ? capitalizeSeriesSlug(seriesSlug) : null;

  return {
    brand: capitalizeBrandSlug(brandSlug),
    series,
    sellerType,
    brandSource: "url-taxonomy",
    seriesSource: series ? "url-taxonomy" : null,
  };
}

function capitalizeBrandSlug(slug: string): string {
  if (slug === "bmw" || slug === "mini" || slug === "mg") {
    return slug.toUpperCase();
  }
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

function capitalizeSeriesSlug(slug: string): string {
  if (slug === "bmw" || slug === "mini" || slug === "mg") {
    return slug.toUpperCase();
  }
  // Keep alphanumeric model codes readable: 320i → 320i, civic → Civic
  if (/^\d/.test(slug)) {
    return slug;
  }
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

/**
 * Ambiguous URL without seller-sale taxonomy → brand must stay null.
 */
export function isAmbiguousArabamSlug(url: string): boolean {
  return !ARABAM_URL_TAXONOMY.test(url);
}

/**
 * Derives trim by stripping known brand + series prefixes from the DOM taxonomy model line.
 * Returns null when the model line does not start with brand/series (no free guessing).
 */
export function deriveTrimFromDomModel(
  domModel: string | null | undefined,
  brand: string | null | undefined,
  series: string | null | undefined,
): string | null {
  if (!domModel?.trim() || !series?.trim()) {
    return null;
  }

  let rest = domModel.trim().replace(/\s+/g, " ");
  const brandNorm = brand?.trim();

  if (brandNorm) {
    const lower = rest.toLocaleLowerCase("tr-TR");
    const brandLower = brandNorm.toLocaleLowerCase("tr-TR");
    if (lower === brandLower) {
      return null;
    }
    if (lower.startsWith(`${brandLower} `)) {
      rest = rest.slice(brandNorm.length).trim();
    }
  }

  const restLower = rest.toLocaleLowerCase("tr-TR");
  const seriesLower = series.trim().toLocaleLowerCase("tr-TR");
  if (restLower === seriesLower) {
    return null;
  }
  if (!restLower.startsWith(`${seriesLower} `)) {
    return null;
  }

  const trim = rest.slice(series.trim().length).trim();
  return trim.length > 0 ? trim : null;
}

/**
 * Resolves series/trim from URL taxonomy + optional JSON-LD model + DOM model line.
 * Never invents from title. Prefer null over wrong taxonomy.
 */
export function resolveArabamSeriesTrim(input: {
  brand: string | null | undefined;
  urlSeries: string | null | undefined;
  urlSeriesSource?: "url-taxonomy" | null;
  ldModel: string | null | undefined;
  domModel: string | null | undefined;
}): ArabamSeriesTrimResolution {
  const brand = input.brand?.trim() || null;
  const domModel = input.domModel?.trim() || null;
  const ldModel = input.ldModel?.trim() || null;

  let series: string | null = null;
  let seriesSource: ArabamSeriesTrimResolution["seriesSource"] = null;

  if (input.urlSeries?.trim()) {
    series = input.urlSeries.trim();
    seriesSource = "url-taxonomy";
  } else if (ldModel) {
    // JSON-LD Vehicle.model when URL lacks series segment
    series = ldModel;
    seriesSource = "json-ld";
  } else if (domModel) {
    series = domModel;
    seriesSource = "legacy-model";
  }

  let trim: string | null = null;
  let trimSource: ArabamSeriesTrimResolution["trimSource"] = null;

  // Trim only when series came from a structured taxonomy source (not legacy full model).
  if (
    series &&
    (seriesSource === "url-taxonomy" || seriesSource === "json-ld") &&
    domModel
  ) {
    trim = deriveTrimFromDomModel(domModel, brand, series);
    if (trim) {
      trimSource = "dom-model";
    }
  }

  // Legacy path: series is the full DOM model → trim stays null
  if (seriesSource === "legacy-model") {
    trim = null;
    trimSource = null;
  }

  return { series, trim, seriesSource, trimSource };
}

function asBrandName(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const name = (value as { name?: unknown }).name;
    if (typeof name === "string" && name.trim()) {
      return name.trim();
    }
  }
  return null;
}

function asMileageValue(value: unknown): number | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const raw = (value as { value?: unknown }).value;
    if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
      return Math.round(raw);
    }
    if (typeof raw === "string" && raw.trim()) {
      const digits = raw.replace(/[^\d]/g, "");
      if (!digits) {
        return null;
      }
      const parsed = Number.parseInt(digits, 10);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    }
  }
  return null;
}

function asYearValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const year = Math.round(value);
    return year >= 1950 && year <= 2100 ? year : null;
  }
  if (typeof value === "string" && /^\d{4}$/.test(value.trim())) {
    const year = Number.parseInt(value.trim(), 10);
    return year >= 1950 && year <= 2100 ? year : null;
  }
  return null;
}

/**
 * Maps one schema.org Vehicle node into a normalized ArabamLdVehicle.
 */
export function mapArabamLdVehicle(item: Record<string, unknown>): ArabamLdVehicle {
  const url = typeof item.url === "string" ? item.url.split("?")[0] ?? item.url : null;
  const brand =
    asBrandName(item.brand) ?? asBrandName(item.manufacturer);
  const model = asBrandName(item.model);
  const mileage = asMileageValue(item.mileageFromOdometer);
  const year =
    asYearValue(item.vehicleModelDate) ?? asYearValue(item.productionDate);

  let transmission: string | null = null;
  if (typeof item.vehicleTransmission === "string" && item.vehicleTransmission.trim()) {
    transmission = item.vehicleTransmission.trim();
  }

  let fuelType: string | null = null;
  const engine = item.vehicleEngine;
  if (engine && typeof engine === "object" && !Array.isArray(engine)) {
    const fuel = (engine as { fuelType?: unknown }).fuelType;
    if (typeof fuel === "string" && fuel.trim()) {
      fuelType = fuel.trim();
    }
  }

  const taxonomy = parseArabamUrlTaxonomy(url);

  return {
    url,
    brand,
    manufacturer: asBrandName(item.manufacturer),
    model,
    mileage,
    year,
    transmission,
    fuelType,
    sellerType: taxonomy.sellerType,
    brandSource: brand ? "json-ld" : null,
    mileageSource: mileage != null ? "json-ld" : null,
    modelSource: model ? "json-ld" : null,
  };
}

/**
 * Browser-side script: collect schema.org Vehicle nodes from ld+json scripts.
 */
export const ARABAM_LDJSON_EXTRACT_SCRIPT = `(() => {
  const out = [];
  const scripts = Array.from(
    document.querySelectorAll("script[type='application/ld+json']"),
  );
  for (const s of scripts) {
    let parsed;
    try {
      parsed = JSON.parse(s.textContent || "null");
    } catch (_) {
      continue;
    }
    const items = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const type = item["@type"];
      const isVehicle =
        type === "Vehicle" ||
        (Array.isArray(type) && type.indexOf("Vehicle") !== -1);
      if (!isVehicle) continue;
      out.push(item);
    }
  }
  return out;
})()`;
