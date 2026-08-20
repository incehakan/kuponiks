import type { RawScrapedListing } from "../normalizer.js";
import {
  BaseScraperAdapter,
  type ScrapeSearchParams,
} from "./base.adapter.js";
import { toListingDto, listingDtoToRaw } from "../scraper.manager.js";
import { cleanPrice } from "../utils/clean-price.js";
import {
  isLetgoBotChallenge,
  parseLetgoSearchJson,
  resolveLetgoNextPageUrl,
  type LetgoParsedListing,
} from "../parsers/letgo.parser.js";

const FETCH_TIMEOUT_MS = 12_000;
const MAX_PAGES = 2;
const MAX_LISTINGS = 20;
const MAX_RETRIES = 2;

/**
 * Letgo adapter — public `/api/search/items` JSON (no stealth, no login).
 */
export class LetgoAdapter extends BaseScraperAdapter {
  readonly platform = "letgo";

  async search(params: ScrapeSearchParams): Promise<RawScrapedListing[]> {
    const limit = Math.min(this.clampLimit(params.limit, 20), MAX_LISTINGS);
    const firstUrl = params.scrapeUrl?.trim();
    if (!firstUrl) {
      console.warn("[letgo] scrapeUrl yok — boş sonuç");
      return [];
    }

    try {
      const collected: LetgoParsedListing[] = [];
      const seen = new Set<string>();
      let url: string | null = firstUrl;

      for (let page = 0; page < MAX_PAGES && url && collected.length < limit; page++) {
        const body = await this.fetchText(url);
        if (body == null) {
          break;
        }
        if (isLetgoBotChallenge(body)) {
          console.warn("[letgo] Bot Manager HTML — JSON search bekleniyordu");
          break;
        }
        const parsed = parseLetgoSearchJson(body);
        for (const row of parsed.listings) {
          if (seen.has(row.externalId)) {
            continue;
          }
          seen.add(row.externalId);
          collected.push(row);
          if (collected.length >= limit) {
            break;
          }
        }
        url =
          collected.length < limit
            ? resolveLetgoNextPageUrl(parsed.nextPageUrl)
            : null;
      }

      const mapped: RawScrapedListing[] = [];
      for (const parsed of collected) {
        const dto = toListingDto(
          this.platform,
          {
            externalId: parsed.externalId,
            title: parsed.title,
            price: parsed.price,
            priceText:
              parsed.price != null ? `${parsed.price} TL` : null,
            city: parsed.city,
            district: parsed.district,
            url: parsed.url,
            category: params.category ?? "Vasıta > Otomobil",
            ...(parsed.brand ? { brand: parsed.brand } : {}),
            ...(parsed.series ? { series: parsed.series } : {}),
            ...(parsed.trim ? { trim: parsed.trim } : {}),
            ...(parsed.year ? { year: parsed.year } : {}),
            ...(parsed.mileage != null ? { mileage: parsed.mileage } : {}),
            ...(parsed.imageUrl ? { imageUrl: parsed.imageUrl } : {}),
            ...(parsed.sellerType ? { sellerType: parsed.sellerType } : {}),
          },
          {
            category: params.category ?? "Vasıta > Otomobil",
          },
        );
        if (dto) {
          mapped.push(listingDtoToRaw(dto));
        } else if (parsed.title && cleanPrice(parsed.price) == null) {
          console.warn(`[letgo] Fiyat parse edilemedi → "${parsed.title}"`);
        }
      }

      console.log(`[letgo] /api/search/items → raw=${collected.length} normalized=${mapped.length}`);
      return mapped;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown letgo scrape error";
      console.error(`[letgo] Arama başarısız: ${message}`);
      return [];
    }
  }

  private async fetchText(url: string): Promise<string | null> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        const res = await fetch(url, {
          redirect: "follow",
          signal: controller.signal,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            Accept: "application/json",
            "Accept-Language": "tr-TR,tr;q=0.9",
            Referer: "https://www.letgo.com/araba-15706_c15706",
          },
        });
        clearTimeout(timer);
        if (res.status !== 200) {
          console.warn(`[letgo] HTTP ${res.status} for ${url}`);
          return null;
        }
        return await res.text();
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `[letgo] fetch attempt ${attempt}/${MAX_RETRIES} failed: ${message}`,
        );
      }
    }
    if (lastError) {
      console.warn(
        `[letgo] fetch exhausted: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
      );
    }
    return null;
  }
}

export const letgoAdapter = new LetgoAdapter();
