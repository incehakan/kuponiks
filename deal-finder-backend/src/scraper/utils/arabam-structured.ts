/**
 * Arabam structured metadata helpers (JSON-LD Vehicle + deterministic URL taxonomy).
 * No title-regex brand/mileage guessing.
 */

export interface ArabamLdVehicle {
  url: string | null;
  brand: string | null;
  manufacturer: string | null;
  mileage: number | null;
  year: number | null;
  transmission: string | null;
  fuelType: string | null;
  sellerType: string | null;
  brandSource: "json-ld" | null;
  mileageSource: "json-ld" | null;
}

const ARABAM_URL_TAXONOMY =
  /^https?:\/\/(?:www\.)?arabam\.com\/ilan\/(galeriden|sahibinden)-(satilik|kiralik)-([a-z0-9]+)(?:-([a-z0-9]+))?/i;

/**
 * Brand from Arabam listing URL taxonomy segment:
 * /ilan/{seller}-{sale}-{brand}-...
 * Rejects free-form title slugs (second path segment is never used).
 */
export function parseArabamUrlTaxonomy(url: string | null | undefined): {
  brand: string | null;
  sellerType: string | null;
  brandSource: "url-taxonomy" | null;
} {
  if (!url?.trim()) {
    return { brand: null, sellerType: null, brandSource: null };
  }

  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return { brand: null, sellerType: null, brandSource: null };
  }

  const match = pathname.match(
    /^\/ilan\/(galeriden|sahibinden)-(satilik|kiralik)-([a-z0-9]+)(?:-|\/|$)/i,
  );
  if (!match) {
    return { brand: null, sellerType: null, brandSource: null };
  }

  const sellerRaw = match[1]!.toLocaleLowerCase("tr-TR");
  const brandSlug = match[3]!.toLocaleLowerCase("tr-TR");

  // Ambiguous / non-brand tokens after sale type → null
  if (!brandSlug || brandSlug.length < 2 || /^\d+$/.test(brandSlug)) {
    return {
      brand: null,
      sellerType: sellerRaw === "galeriden" ? "Galeriden" : "Sahibinden",
      brandSource: null,
    };
  }

  return {
    brand: capitalizeBrandSlug(brandSlug),
    sellerType: sellerRaw === "galeriden" ? "Galeriden" : "Sahibinden",
    brandSource: "url-taxonomy",
  };
}

function capitalizeBrandSlug(slug: string): string {
  if (slug === "bmw" || slug === "mini" || slug === "mg") {
    return slug.toUpperCase();
  }
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

/**
 * Ambiguous URL without seller-sale taxonomy → brand must stay null.
 */
export function isAmbiguousArabamSlug(url: string): boolean {
  return !ARABAM_URL_TAXONOMY.test(url);
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
    mileage,
    year,
    transmission,
    fuelType,
    sellerType: taxonomy.sellerType,
    brandSource: brand ? "json-ld" : null,
    mileageSource: mileage != null ? "json-ld" : null,
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
