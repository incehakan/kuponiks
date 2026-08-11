import type { Browser, Page } from "puppeteer";
import type { RawScrapedListing } from "../normalizer.js";
import {
  BaseScraperAdapter,
  type ScrapeSearchParams,
} from "./base.adapter.js";
import {
  launchStealthBrowser,
  prepareStealthPage,
  waitForCloudflareClearance,
} from "../puppeteer/stealth-browser.js";
import { toListingDto, listingDtoToRaw } from "../scraper.manager.js";
import type { DomListingRow } from "../types/listing.dto.js";
import { cleanPrice } from "../utils/clean-price.js";
import {
  HEPSIEMLAK_EXTRACT_SCRIPT,
  HEPSIEMLAK_PROBE_SCRIPT,
  HEPSIEMLAK_WAIT_SELECTOR,
} from "../parsers/hepsiemlak.parser.js";
import { logDomProbe } from "../parsers/dom-probe.js";

const MAX_RETRIES = 3;

/**
 * Hepsiemlak.com adapter — puppeteer-extra + stealth + CF clearance wait.
 * Prefers city path URLs: https://www.hepsiemlak.com/{city}-satilik
 */
export class HepsiemlakAdapter extends BaseScraperAdapter {
  readonly platform = "hepsiemlak";

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
          `[hepsiemlak] Stealth deneme ${attempt}/${MAX_RETRIES} (proxy IP rotate) → ${url}`,
        );

        browser = await launchStealthBrowser({
          profileName: "hepsiemlak",
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
          console.warn(
            `[hepsiemlak] Navigation failed (attempt=${attempt}): ${message}`,
          );
          if (attempt < MAX_RETRIES) {
            continue;
          }
          return this.resolveListingsOrDevFallback([], params, {
            htmlLength: 0,
            reason: `navigation timeout: ${message}`,
          });
        }

        const cleared = await waitForCloudflareClearance(page, {
          timeoutMs: 28_000,
          pollMs: 2_000,
          label: "hepsiemlak",
        });
        if (!cleared) {
          console.warn(
            `[hepsiemlak] Cloudflare challenge devam ediyor (attempt=${attempt}/${MAX_RETRIES})`,
          );
          await logDomProbe(this.platform, page, HEPSIEMLAK_PROBE_SCRIPT);
          if (attempt < MAX_RETRIES) {
            continue;
          }
          const htmlLength = (await page.content()).length;
          return this.resolveListingsOrDevFallback([], params, {
            htmlLength,
            reason: "cloudflare challenge (retries tükendi)",
          });
        }

        await this.randomDelay(1_500, 3_000);

        try {
          await page.waitForSelector(HEPSIEMLAK_WAIT_SELECTOR, {
            timeout: 15_000,
          });
        } catch {
          console.warn(
            `[hepsiemlak] Selector bulunamadı (${HEPSIEMLAK_WAIT_SELECTOR}) attempt=${attempt}/${MAX_RETRIES}`,
          );
          await logDomProbe(this.platform, page, HEPSIEMLAK_PROBE_SCRIPT);

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

        const rows = await this.extractDomRows(page);
        console.log(`[hepsiemlak] Canlı DOM satır=${rows.length}`);

        if (rows.length === 0) {
          await logDomProbe(this.platform, page, HEPSIEMLAK_PROBE_SCRIPT);
        }

        const liveDeals = this.mapRows(rows, params).slice(0, limit);

        if (liveDeals.length >= 1) {
          console.log(
            `[hepsiemlak] Canlı DOM → ${liveDeals.length} ilan, mock DEVRE DIŞI`,
          );
          return liveDeals;
        }

        console.warn(
          `[hepsiemlak] DOM parse 0 ilan (attempt=${attempt}/${MAX_RETRIES}) — yeni IP denenecek`,
        );
        if (attempt < MAX_RETRIES) {
          await this.randomDelay(2_000, 3_500);
          continue;
        }

        const htmlLength = (await page.content()).length;
        return this.resolveListingsOrDevFallback([], params, {
          htmlLength,
          reason: "DOM parse boş (retries tükendi)",
        });
      }

      return [];
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown hepsiemlak scrape error";
      console.error(`[hepsiemlak] Stealth scrape başarısız: ${message}`);
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
    const citySlug = this.toCitySlug(params.city);
    const keyword = params.query?.trim() || params.category?.trim() || "";

    // Prefer SEO city path — fewer CF / empty states than /arama?q=
    if (citySlug && !keyword) {
      return `https://www.hepsiemlak.com/${citySlug}-satilik`;
    }
    if (citySlug && keyword) {
      const search = new URL(`https://www.hepsiemlak.com/${citySlug}-satilik`);
      search.searchParams.set("q", keyword);
      return search.toString();
    }

    const search = new URL("https://www.hepsiemlak.com/arama");
    if (keyword) {
      search.searchParams.set("q", keyword);
    }
    return search.toString();
  }

  private toCitySlug(city: string | undefined): string | null {
    if (!city?.trim()) {
      return null;
    }
    return city
      .trim()
      .toLocaleLowerCase("tr-TR")
      .replace(/ı/g, "i")
      .replace(/ğ/g, "g")
      .replace(/ü/g, "u")
      .replace(/ş/g, "s")
      .replace(/ö/g, "o")
      .replace(/ç/g, "c")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  private async extractDomRows(page: Page): Promise<DomListingRow[]> {
    const rows = await page.evaluate(HEPSIEMLAK_EXTRACT_SCRIPT);
    return Array.isArray(rows) ? (rows as DomListingRow[]) : [];
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
          category: params.category ?? "Emlak",
        },
        {
          category: params.category ?? "Emlak",
          ...(params.city ? { city: params.city } : {}),
        },
      );

      if (dto) {
        const raw = listingDtoToRaw(dto);
        if (row.imageUrl) {
          raw.imageUrl = row.imageUrl;
        }
        out.push(raw);
      } else if (row.title && cleanPrice(row.priceText) == null) {
        console.warn(
          `[hepsiemlak] Fiyat parse edilemedi, satır atlandı → "${row.title}"`,
        );
      }
    }
    return out;
  }
}

export const hepsiemlakAdapter = new HepsiemlakAdapter();
