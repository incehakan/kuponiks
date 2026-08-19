import type { RawScrapedListing } from "../normalizer.js";
import {
  BaseScraperAdapter,
  type ScrapeSearchParams,
} from "./base.adapter.js";
import { toListingDto, listingDtoToRaw } from "../scraper.manager.js";
import {
  parseOtoplusListHtml,
  otoplusToDomRow,
} from "../parsers/otoplus.parser.js";
import { cleanPrice } from "../utils/clean-price.js";

const LIST_URL = "https://www.otoplus.com/al";

export class OtoplusAdapter extends BaseScraperAdapter {
  readonly platform = "otoplus";

  async search(params: ScrapeSearchParams): Promise<RawScrapedListing[]> {
    const limit = this.clampLimit(params.limit);
    const firstUrl = params.scrapeUrl?.trim() || LIST_URL;
    const collected = await this.fetchPage(firstUrl);
    if (collected.length < limit && !pageParam(firstUrl)) {
      const page2 = withPage(firstUrl, 2);
      const extra = await this.fetchPage(page2);
      const seen = new Set(collected.map((row) => row.externalId));
      for (const row of extra) {
        if (!seen.has(row.externalId)) {
          collected.push(row);
        }
      }
    }
    const mapped: RawScrapedListing[] = [];
    for (const parsed of collected.slice(0, limit)) {
      const row = otoplusToDomRow(parsed);
      const dto = toListingDto(
        this.platform,
        {
          externalId: row.externalId,
          title: row.title,
          priceText: row.priceText,
          city: row.city,
          url: row.url,
          category: params.category ?? "Vasıta > Otomobil",
          ...(row.brand ? { brand: row.brand } : {}),
          ...(row.series ? { series: row.series } : {}),
          ...(row.trim ? { trim: row.trim } : {}),
          ...(row.year ? { year: row.year } : {}),
          ...(row.mileage != null ? { mileage: row.mileage } : {}),
          ...(row.imageUrl ? { imageUrl: row.imageUrl } : {}),
          ...(row.sellerType ? { sellerType: row.sellerType } : {}),
        },
        {
          category: params.category ?? "Vasıta > Otomobil",
        },
      );
      if (dto) {
        mapped.push(listingDtoToRaw(dto));
      } else if (row.title && cleanPrice(row.priceText) == null) {
        console.warn(`[otoplus] Fiyat parse edilemedi → "${row.title}"`);
      }
    }
    console.log(`[otoplus] Public HTML → ${mapped.length} ilan`);
    return mapped;
  }

  private async fetchPage(url: string) {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "tr-TR,tr;q=0.9",
      },
    });
    if (res.status !== 200) {
      console.warn(`[otoplus] HTTP ${res.status} for ${url}`);
      return [];
    }
    return parseOtoplusListHtml(await res.text());
  }
}

function pageParam(url: string): boolean {
  return /[?&]sayfa=\d+/i.test(url);
}

function withPage(url: string, page: number): string {
  const parsed = new URL(url);
  parsed.searchParams.set("sayfa", String(page));
  return parsed.toString();
}

export const otoplusAdapter = new OtoplusAdapter();
