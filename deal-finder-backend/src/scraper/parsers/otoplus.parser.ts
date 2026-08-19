import type { DomListingRow } from "../types/listing.dto.js";
import {
  collectJsonLdByType,
  jsonLdOfferPrice,
} from "../utils/jsonld-html.js";

const BASE = "https://www.otoplus.com";

export interface OtoplusParsedListing {
  externalId: string;
  url: string;
  title: string;
  price: number | null;
  brand: string | null;
  series: string | null;
  trim: string | null;
  year: number | null;
  mileage: number | null;
  city: string | null;
  imageUrl: string | null;
  sellerType: string;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ş", "s")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function otoplusBrandSeriesPath(
  brand?: string | null,
  series?: string | null,
): string | null {
  if (!brand?.trim()) {
    return null;
  }
  const brandSlug = slugify(brand);
  if (!brandSlug) {
    return null;
  }
  if (!series?.trim()) {
    return `/${brandSlug}`;
  }
  const seriesSlug = slugify(series);
  return seriesSlug ? `/${brandSlug}/${seriesSlug}` : `/${brandSlug}`;
}

export function parseOtoplusExternalId(url: string): string | null {
  const match = url.match(/-(\d+)(?:\/)?$/);
  return match?.[1] ?? null;
}

export function parseOtoplusUrlMeta(url: string): {
  year: number | null;
  mileage: number | null;
  city: string | null;
} {
  const path = (() => {
    try {
      return decodeURIComponent(new URL(url).pathname);
    } catch {
      return url;
    }
  })();
  const yearMatch = path.match(/-(19|20)\d{2}-/);
  const mileageMatch = path.match(/-(\d+)km-/i);
  const cityMatch = path.match(/ekspertizli-([^-]+)-\d+tl-\d+$/i);
  const year = yearMatch
    ? Number.parseInt(yearMatch[0].replace(/\D/g, ""), 10)
    : null;
  const mileage = mileageMatch ? Number.parseInt(mileageMatch[1]!, 10) : null;
  let city: string | null = cityMatch?.[1]?.trim() ?? null;
  if (city) {
    city = city.charAt(0).toLocaleUpperCase("tr-TR") + city.slice(1);
  }
  return {
    year: year && year >= 1950 && year <= 2100 ? year : null,
    mileage: Number.isFinite(mileage) ? mileage : null,
    city,
  };
}

function asBrand(value: unknown): string | null {
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

function asYear(value: unknown): number | null {
  if (typeof value === "number" && value >= 1950 && value <= 2100) {
    return Math.round(value);
  }
  if (typeof value === "string" && /^(19|20)\d{2}$/.test(value.trim())) {
    return Number.parseInt(value.trim(), 10);
  }
  return null;
}

function asMileage(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return asMileage((value as { value?: unknown }).value);
  }
  if (typeof value === "string") {
    const digits = value.replace(/[^\d]/g, "");
    return digits ? Number.parseInt(digits, 10) : null;
  }
  return null;
}

function asImage(value: unknown): string | null {
  if (typeof value === "string" && /^https?:\/\//i.test(value)) {
    return value.split("?")[0] ?? value;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = asImage(item);
      if (found) return found;
    }
  }
  if (value && typeof value === "object") {
    const rec = value as { url?: unknown; contentUrl?: unknown };
    return asImage(rec.url) ?? asImage(rec.contentUrl);
  }
  return null;
}

function seriesFromUrl(url: string, brand: string | null): string | null {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    if (parts.length >= 2) {
      const seriesSlug = parts[1]!;
      if (brand && slugify(brand) === seriesSlug) {
        return brand;
      }
      return seriesSlug
        .split("-")
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(" ");
    }
  } catch {
    // ignore
  }
  return null;
}

export function parseOtoplusListHtml(html: string): OtoplusParsedListing[] {
  const vehicles = collectJsonLdByType(html, "Vehicle");
  const seen = new Set<string>();
  const out: OtoplusParsedListing[] = [];
  for (const vehicle of vehicles) {
    const rawUrl =
      typeof vehicle.url === "string" ? vehicle.url.split("?")[0]! : null;
    if (!rawUrl) continue;
    const url = rawUrl.startsWith("http") ? rawUrl : `${BASE}${rawUrl}`;
    const externalId = parseOtoplusExternalId(url);
    if (!externalId || seen.has(externalId)) continue;
    seen.add(externalId);
    const meta = parseOtoplusUrlMeta(url);
    const brand = asBrand(vehicle.brand);
    const name =
      typeof vehicle.name === "string" ? vehicle.name.replace(/\s+/g, " ").trim() : "";
    const year =
      asYear(vehicle.modelDate) ??
      asYear(vehicle.vehicleModelDate) ??
      asYear(vehicle.productionDate) ??
      meta.year;
    const mileage =
      asMileage(vehicle.mileageFromOdometer) ?? meta.mileage;
    const series = seriesFromUrl(url, brand);
    let trim: string | null = null;
    if (series && name) {
      const idx = name.toLocaleLowerCase("tr-TR").indexOf(
        series.toLocaleLowerCase("tr-TR"),
      );
      if (idx >= 0) {
        const rest = name.slice(idx + series.length).trim();
        trim = rest.length > 0 ? rest : null;
      }
    }
    out.push({
      externalId,
      url,
      title: name || `${brand ?? ""} ${series ?? ""}`.trim(),
      price: jsonLdOfferPrice(vehicle),
      brand,
      series,
      trim,
      year,
      mileage,
      city: meta.city,
      imageUrl: asImage(vehicle.image),
      sellerType: "Galeriden",
    });
  }
  return out;
}

export function otoplusToDomRow(row: OtoplusParsedListing): DomListingRow {
  return {
    externalId: row.externalId,
    title: row.title,
    priceText: row.price != null ? `${row.price} TL` : null,
    city: row.city,
    url: row.url,
    ...(row.imageUrl ? { imageUrl: row.imageUrl } : {}),
    ...(row.brand ? { brand: row.brand } : {}),
    ...(row.series ? { series: row.series } : {}),
    ...(row.trim ? { trim: row.trim } : {}),
    ...(row.year != null ? { year: String(row.year) } : {}),
    ...(row.mileage != null ? { mileage: row.mileage } : {}),
    sellerType: row.sellerType,
  };
}
