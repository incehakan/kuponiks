import type { Browser, Page } from "puppeteer";
import type { RawScrapedListing } from "../normalizer.js";
import {
  BaseScraperAdapter,
  type ScrapeSearchParams,
} from "./base.adapter.js";
import {
  launchStealthBrowser,
  prepareStealthPage,
} from "../puppeteer/stealth-browser.js";
import { toListingDto, listingDtoToRaw } from "../scraper.manager.js";
import type { DomListingRow } from "../types/listing.dto.js";
import { cleanPrice } from "../utils/clean-price.js";
import {
  ARABAM_EXTRACT_SCRIPT,
  ARABAM_PROBE_SCRIPT,
  ARABAM_WAIT_SELECTOR,
} from "../parsers/arabam.parser.js";
import { logDomProbe } from "../parsers/dom-probe.js";
import {
  ARABAM_LDJSON_EXTRACT_SCRIPT,
  mapArabamLdVehicle,
  parseArabamUrlTaxonomy,
  type ArabamLdVehicle,
} from "../utils/arabam-structured.js";

const MAX_RETRIES = 3;

/**
 * Arabam.com adapter — puppeteer-extra + stealth.
 * Search: https://www.arabam.com/ikinci-el?searchText={keyword}&take=50
 * Brand/mileage: schema.org JSON-LD Vehicle (+ URL taxonomy fallback for brand).
 */
export class ArabamAdapter extends BaseScraperAdapter {
  readonly platform = "arabam";

  async search(params: ScrapeSearchParams): Promise<RawScrapedListing[]> {
    const limit = this.clampLimit(params.limit);
    const url = this.buildSearchUrl(params);

    let browser: Browser | null = null;

    try {
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        await this.randomDelay(1_000, 2_500);

        try {
          await browser?.close();
        } catch {
          // ignore
        }
        browser = null;

        console.log(
          `[arabam] Stealth deneme ${attempt}/${MAX_RETRIES} (proxy IP rotate) → ${url}`,
        );

        browser = await launchStealthBrowser({
          profileName: "arabam",
          rotateSession: true,
        });
        const page = await browser.newPage();
        await prepareStealthPage(page);

        try {
          await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 45_000,
          });
        } catch (navError) {
          const message =
            navError instanceof Error ? navError.message : "navigation timeout";
          console.warn(`[arabam] Navigation failed (attempt=${attempt}): ${message}`);
          if (attempt < MAX_RETRIES) {
            continue;
          }
          return this.resolveListingsOrDevFallback([], params, {
            htmlLength: 0,
            reason: `navigation timeout: ${message}`,
          });
        }

        await this.randomDelay(2_000, 3_500);

        let selectorReady = false;
        try {
          await page.waitForSelector(ARABAM_WAIT_SELECTOR, { timeout: 15_000 });
          selectorReady = true;
        } catch {
          console.warn(
            `[arabam] Selector bulunamadı (${ARABAM_WAIT_SELECTOR}) attempt=${attempt}/${MAX_RETRIES}`,
          );
          await logDomProbe(this.platform, page, ARABAM_PROBE_SCRIPT);

          if (attempt < MAX_RETRIES) {
            await this.randomDelay(2_000, 4_000);
            continue;
          }

          const htmlLength = (await page.content()).length;
          return this.resolveListingsOrDevFallback([], params, {
            htmlLength,
            reason: "listing selector timeout (retries tükendi)",
          });
        }

        if (!selectorReady) {
          continue;
        }

        const rows = await this.extractDomRows(page);
        const ldVehicles = await this.extractLdVehicles(page);
        console.log(
          `[arabam] Canlı DOM satır=${rows.length} JSON-LD Vehicle=${ldVehicles.length}`,
        );

        if (rows.length === 0) {
          await logDomProbe(this.platform, page, ARABAM_PROBE_SCRIPT);
        }

        const enriched = this.mergeStructuredData(rows, ldVehicles);
        const liveDeals = this.mapRows(enriched, params).slice(0, limit);

        if (liveDeals.length >= 1) {
          console.log(`[arabam] Canlı DOM → ${liveDeals.length} ilan`);
          return liveDeals;
        }

        console.warn(
          `[arabam] DOM boş (attempt=${attempt}/${MAX_RETRIES}) — yeni IP denenecek`,
        );
        if (attempt < MAX_RETRIES) {
          await this.randomDelay(2_000, 4_000);
          continue;
        }

        const htmlLength = (await page.content()).length;
        return this.resolveListingsOrDevFallback([], params, {
          htmlLength,
          reason: "listing rows boş (retries tükendi)",
        });
      }

      return this.resolveListingsOrDevFallback([], params, {
        htmlLength: 0,
        reason: "beklenmeyen retry çıkışı",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown arabam scrape error";
      console.error(`[arabam] Puppeteer stealth arama başarısız: ${message}`);
      return this.resolveListingsOrDevFallback([], params, {
        htmlLength: 0,
        reason: `puppeteer hata: ${message}`,
      });
    } finally {
      try {
        await browser?.close();
      } catch {
        // ignore
      }
    }
  }

  private buildSearchUrl(params: ScrapeSearchParams): string {
    const search = new URL("https://www.arabam.com/ikinci-el");
    const parts = [
      params.query?.trim(),
      params.city?.trim(),
      params.category?.trim(),
    ].filter((v): v is string => Boolean(v && v.length > 0));
    const keyword = parts[0] ?? "";
    if (keyword) {
      search.searchParams.set("searchText", keyword);
    }
    search.searchParams.set("take", "50");
    return search.toString();
  }

  private async extractDomRows(page: Page): Promise<DomListingRow[]> {
    const rows = await page.evaluate(ARABAM_EXTRACT_SCRIPT);
    return Array.isArray(rows) ? (rows as DomListingRow[]) : [];
  }

  private async extractLdVehicles(page: Page): Promise<ArabamLdVehicle[]> {
    const raw = await page.evaluate(ARABAM_LDJSON_EXTRACT_SCRIPT);
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw
      .filter((item): item is Record<string, unknown> =>
        Boolean(item && typeof item === "object"),
      )
      .map((item) => mapArabamLdVehicle(item));
  }

  /**
   * Joins DOM rows with JSON-LD Vehicle nodes by canonical URL.
   * Brand fallback: deterministic /ilan/{seller}-{sale}-{brand}-… taxonomy only.
   */
  private mergeStructuredData(
    rows: DomListingRow[],
    vehicles: ArabamLdVehicle[],
  ): DomListingRow[] {
    const byUrl = new Map<string, ArabamLdVehicle>();
    for (const vehicle of vehicles) {
      if (!vehicle.url) {
        continue;
      }
      const key = this.canonicalizeListingUrl(vehicle.url);
      if (key) {
        byUrl.set(key, vehicle);
      }
    }

    return rows.map((row) => {
      const key = this.canonicalizeListingUrl(row.url);
      const ld = key ? byUrl.get(key) : undefined;
      const taxonomy = parseArabamUrlTaxonomy(row.url);

      const brand = ld?.brand ?? taxonomy.brand;
      const brandSource =
        ld?.brand != null ? "json-ld" : taxonomy.brandSource;

      const mileage = ld?.mileage ?? null;
      const mileageSource = ld?.mileage != null ? "json-ld" : null;

      const year =
        row.year ?? (ld?.year != null ? String(ld.year) : null);

      return {
        ...row,
        ...(brand ? { brand } : {}),
        ...(brandSource ? { brandSource } : {}),
        ...(mileage != null ? { mileage } : {}),
        ...(mileageSource ? { mileageSource } : {}),
        ...(year ? { year } : {}),
        ...(taxonomy.sellerType || ld?.sellerType
          ? { sellerType: ld?.sellerType ?? taxonomy.sellerType }
          : {}),
        ...(ld?.fuelType ? { fuelType: ld.fuelType } : {}),
        ...(ld?.transmission ? { transmission: ld.transmission } : {}),
      };
    });
  }

  private canonicalizeListingUrl(url: string | null | undefined): string | null {
    if (!url?.trim()) {
      return null;
    }
    try {
      const parsed = new URL(
        url.startsWith("http") ? url : `https://www.arabam.com${url}`,
      );
      return parsed.pathname.replace(/\/+$/, "").toLowerCase();
    } catch {
      return null;
    }
  }

  private mapRows(
    rows: DomListingRow[],
    params: ScrapeSearchParams,
  ): RawScrapedListing[] {
    const out: RawScrapedListing[] = [];
    for (const row of rows) {
      const dto = toListingDto(
        this.platform,
        {
          externalId: row.externalId,
          title: row.title,
          priceText: row.priceText,
          city: row.city,
          url: row.url,
          category: params.category ?? "Vasıta > Otomobil",
          ...(row.district != null ? { district: row.district } : {}),
          ...(row.model != null ? { model: row.model } : {}),
          ...(row.brand != null ? { brand: row.brand } : {}),
          ...(row.year != null ? { year: row.year } : {}),
          ...(row.mileage != null ? { mileage: row.mileage } : {}),
          ...(row.imageUrl != null ? { imageUrl: row.imageUrl } : {}),
          ...(row.sellerType != null ? { sellerType: row.sellerType } : {}),
          ...(row.fuelType != null ? { fuelType: row.fuelType } : {}),
          ...(row.transmission != null
            ? { transmission: row.transmission }
            : {}),
          ...(row.brandSource != null ? { brandSource: row.brandSource } : {}),
          ...(row.mileageSource != null
            ? { mileageSource: row.mileageSource }
            : {}),
        },
        {
          category: params.category ?? "Vasıta > Otomobil",
          ...(params.city ? { city: params.city } : {}),
        },
      );

      if (dto) {
        out.push(listingDtoToRaw(dto));
      } else if (row.title && cleanPrice(row.priceText) == null) {
        console.warn(
          `[arabam] Fiyat parse edilemedi, satır atlandı → "${row.title}"`,
        );
      }
    }
    return out;
  }
}

export const arabamAdapter = new ArabamAdapter();
