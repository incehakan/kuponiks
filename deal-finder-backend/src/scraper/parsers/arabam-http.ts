import type { DomListingRow } from "../types/listing.dto.js";
import {
  collectJsonLdByType,
  jsonLdOfferPrice,
} from "../utils/jsonld-html.js";
import {
  mapArabamLdVehicle,
  parseArabamUrlTaxonomy,
  resolveArabamSeriesTrim,
} from "../utils/arabam-structured.js";
import { pickBestListingImage } from "../../lib/listing-image.js";

export function parseArabamDomRowsFromHtml(html: string): DomListingRow[] {
  const rows: DomListingRow[] = [];
  const seen = new Set<string>();
  const rowRe =
    /<tr[^>]*class="[^"]*listing-list-item[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
  let match: RegExpExecArray | null;
  while ((match = rowRe.exec(html)) !== null) {
    const chunk = match[1] ?? "";
    if (!/\/ilan\//i.test(chunk)) continue;
    const href =
      chunk.match(/href="([^"]*\/ilan\/[^"]+)"/i)?.[1] ||
      chunk.match(/href='([^']*\/ilan\/[^']+)'/i)?.[1];
    if (!href) continue;
    const url = href.startsWith("http")
      ? href.split("?")[0]!
      : `https://www.arabam.com${href.startsWith("/") ? "" : "/"}${href}`.split(
          "?",
        )[0]!;
    if (seen.has(url)) continue;
    seen.add(url);
    const idMatch = url.match(/\/(\d{5,})(?:\/)?$/);
    const externalId =
      chunk.match(/data-imp-id="([^"]+)"/i)?.[1] ||
      chunk.match(/id="listing(\d+)"/i)?.[1] ||
      idMatch?.[1] ||
      null;
    const title = textOf(
      chunk.match(
        /class="[^"]*listing-title-lines[^"]*"[^>]*>([\s\S]*?)<\//i,
      )?.[1],
    );
    const model = textOf(
      chunk.match(
        /listing-modelname[\s\S]*?class="[^"]*listing-text-new[^"]*"[^>]*>([\s\S]*?)<\//i,
      )?.[1],
    );
    const priceText = textOf(
      chunk.match(/class="[^"]*listing-price[^"]*"[^>]*>([\s\S]*?)<\//i)?.[1],
    );
    let year: string | null = null;
    const yearCells = chunk.matchAll(
      /<td[^>]*class="[^"]*listing-text[^"]*"[^>]*>([\s\S]*?)<\/td>/gi,
    );
    for (const cell of yearCells) {
      const text = textOf(cell[1]);
      if (text && /^(19|20)\d{2}$/.test(text)) {
        year = text;
        break;
      }
    }
    const city = chunk.match(/<span[^>]*title="([^"]+)"/i)?.[1]?.trim() ?? null;
    const img =
      chunk.match(/srcset="([^"]+)"/i)?.[1]?.split(",")[0]?.trim().split(/\s+/)[0] ||
      chunk.match(/src="([^"]*(?:ilanfotograf|arbstorage)[^"]*)"/i)?.[1] ||
      null;
    rows.push({
      externalId,
      title,
      priceText,
      city,
      url,
      ...(img ? { imageUrl: img } : {}),
      ...(model ? { model } : {}),
      ...(year ? { year } : {}),
    });
  }
  return rows;
}

function textOf(raw: string | undefined): string | null {
  if (!raw) return null;
  const text = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : null;
}

export function parseArabamListHtml(html: string): DomListingRow[] {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  if (/bir dakika lütfen|just a moment|attention required/i.test(title)) {
    return [];
  }
  const rows = parseArabamDomRowsFromHtml(html);
  const vehicles = collectJsonLdByType(html, "Vehicle").map((item) =>
    mapArabamLdVehicle(item),
  );
  if (rows.length === 0) {
    return vehiclesToRows(vehicles, html);
  }
  const byUrl = new Map(
    vehicles
      .filter((v) => v.url)
      .map((v) => [canonicalize(v.url!), v] as const),
  );
  return rows.map((row) => {
    const ld = row.url ? byUrl.get(canonicalize(row.url)) : undefined;
    const taxonomy = parseArabamUrlTaxonomy(row.url);
    const brand = ld?.brand ?? taxonomy.brand;
    const resolved = resolveArabamSeriesTrim({
      brand,
      urlSeries: taxonomy.series,
      urlSeriesSource: taxonomy.seriesSource,
      ldModel: ld?.model ?? null,
      domModel: row.model ?? null,
    });
    const image = pickBestListingImage([
      { url: ld?.imageUrl, source: "json-ld" },
      { url: row.imageUrl, source: "srcset" },
    ]);
    return {
      ...row,
      ...(image ? { imageUrl: image.url, imageSource: image.source } : {}),
      ...(brand ? { brand } : {}),
      ...(ld?.mileage != null ? { mileage: ld.mileage, mileageSource: "json-ld" } : {}),
      ...(row.year || ld?.year
        ? { year: row.year ?? (ld?.year != null ? String(ld.year) : null) }
        : {}),
      ...(resolved.series ? { series: resolved.series } : {}),
      ...(resolved.trim ? { trim: resolved.trim } : {}),
      ...(resolved.seriesSource ? { seriesSource: resolved.seriesSource } : {}),
      ...(taxonomy.sellerType || ld?.sellerType
        ? { sellerType: ld?.sellerType ?? taxonomy.sellerType }
        : {}),
    };
  });
}

function vehiclesToRows(
  vehicles: ReturnType<typeof mapArabamLdVehicle>[],
  html: string,
): DomListingRow[] {
  const prices = collectJsonLdByType(html, "Vehicle").map((item) =>
    jsonLdOfferPrice(item),
  );
  return vehicles.map((vehicle, index) => {
    const url = vehicle.url;
    const id = url?.match(/\/(\d{5,})(?:\/)?$/)?.[1] ?? null;
    const taxonomy = parseArabamUrlTaxonomy(url);
    const resolved = resolveArabamSeriesTrim({
      brand: vehicle.brand,
      urlSeries: taxonomy.series,
      urlSeriesSource: taxonomy.seriesSource,
      ldModel: vehicle.model,
      domModel: vehicle.model,
    });
    const price = prices[index];
    return {
      externalId: id,
      title: vehicle.model ?? vehicle.brand,
      priceText: price != null ? `${price} TL` : null,
      city: null,
      url,
      ...(vehicle.imageUrl ? { imageUrl: vehicle.imageUrl } : {}),
      ...(vehicle.brand ? { brand: vehicle.brand } : {}),
      ...(vehicle.year != null ? { year: String(vehicle.year) } : {}),
      ...(vehicle.mileage != null ? { mileage: vehicle.mileage } : {}),
      ...(resolved.series ? { series: resolved.series } : {}),
    };
  });
}

function canonicalize(url: string): string {
  try {
    return new URL(url).pathname.replace(/\/+$/, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}
