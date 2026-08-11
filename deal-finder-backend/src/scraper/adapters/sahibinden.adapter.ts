import type { Browser, Page } from "puppeteer";
import type { RawScrapedListing } from "../normalizer.js";
import {
  launchStealthBrowser,
  prepareStealthPage,
  waitForCloudflareClearance,
} from "../puppeteer/stealth-browser.js";
import {
  BaseScraperAdapter,
  type ScrapeSearchParams,
} from "./base.adapter.js";

const MAX_CLOUDFLARE_RETRIES = 3;

interface DomListingRow {
  externalId: string | null;
  title: string | null;
  priceText: string | null;
  city: string | null;
  url: string | null;
}

/**
 * Sahibinden.com adapter powered by puppeteer-extra + stealth.
 * Headless Chromium with AutomationControlled disabled; parses live
 * `.searchResultsItem` DOM and returns real listing data.
 */
export class SahibindenAdapter extends BaseScraperAdapter {
  readonly platform = "sahibinden";

  async search(params: ScrapeSearchParams): Promise<RawScrapedListing[]> {
    const limit = this.clampLimit(params.limit);
    const url = this.buildSearchUrl(params);

    let browser: Browser | null = null;

    try {
      for (let attempt = 1; attempt <= MAX_CLOUDFLARE_RETRIES; attempt++) {
        await this.randomDelay(1_000, 3_000);

        // Close previous browser so the rotating proxy assigns a new exit IP.
        try {
          await browser?.close();
        } catch {
          // ignore
        }
        browser = null;

        console.log(
          `[sahibinden] Stealth Puppeteer deneme ${attempt}/${MAX_CLOUDFLARE_RETRIES} (proxy IP rotate) → ${url}`,
        );

        browser = await launchStealthBrowser({
          profileName: "sahibinden",
          rotateSession: true,
        });
        const page = await browser.newPage();
        await prepareStealthPage(page, { randomizeFingerprint: true });

        try {
          await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 45_000,
          });
        } catch (navError) {
          const message =
            navError instanceof Error ? navError.message : "navigation timeout";
          console.warn(
            `[sahibinden] Navigation failed (attempt=${attempt}): ${message}`,
          );
          if (attempt < MAX_CLOUDFLARE_RETRIES) {
            continue;
          }
          return this.resolveListingsOrDevFallback([], params, {
            htmlLength: 0,
            reason: `navigation timeout: ${message}`,
          });
        }

        const cleared = await waitForCloudflareClearance(page, {
          timeoutMs: 22_000,
          pollMs: 2_000,
          label: "sahibinden",
        });
        await this.randomDelay(1_000, 2_500);

        const blocked = !cleared || (await this.looksBlocked(page));
        const tableReady = blocked ? false : await this.waitForResultsTable(page);

        if (blocked || !tableReady) {
          console.warn(
            `[sahibinden] Cloudflare/Turnstile veya tablo yok (attempt=${attempt}/${MAX_CLOUDFLARE_RETRIES}) — yeni IP denenecek`,
          );

          if (attempt < MAX_CLOUDFLARE_RETRIES) {
            await this.randomDelay(2_500, 4_500);
            continue;
          }

          const htmlLength = (await page.content()).length;
          return this.resolveListingsOrDevFallback([], params, {
            htmlLength,
            reason: blocked
              ? "Cloudflare/Turnstile engeli (3 retry tükendi)"
              : "searchResultsTable timeout (3 retry tükendi)",
          });
        }

        await this.randomDelay(1_000, 2_500);

        const rows = await this.extractDomRows(page);
        console.log(
          `[sahibinden] Canlı DOM .searchResultsItem satır=${rows.length}`,
        );

        const listings = rows
          .map((row) => this.mapRow(row, params))
          .filter((item): item is RawScrapedListing => item != null)
          .slice(0, limit);

        if (listings.length > 0) {
          console.log(
            `[sahibinden] Canlı DOM → ${listings.length} ilan (kelepir override YOK)`,
          );
          return listings;
        }

        console.warn(
          `[sahibinden] DOM boş (attempt=${attempt}/${MAX_CLOUDFLARE_RETRIES}) — yeni IP denenecek`,
        );
        if (attempt < MAX_CLOUDFLARE_RETRIES) {
          await this.randomDelay(2_000, 4_000);
          continue;
        }

        const htmlLength = (await page.content()).length;
        return this.resolveListingsOrDevFallback([], params, {
          htmlLength,
          reason: "searchResultsItem boş (3 retry tükendi)",
        });
      }

      return this.resolveListingsOrDevFallback([], params, {
        htmlLength: 0,
        reason: "beklenmeyen retry çıkışı",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown sahibinden scrape error";
      console.error(`[sahibinden] Puppeteer stealth arama başarısız: ${message}`);
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

  private async waitForResultsTable(page: Page): Promise<boolean> {
    try {
      await page.waitForSelector(".searchResultsTable", { timeout: 10_000 });
      console.log("[sahibinden] .searchResultsTable hazır");
      return true;
    } catch {
      try {
        await page.waitForSelector("#searchResultsTable", { timeout: 2_000 });
        console.log("[sahibinden] #searchResultsTable hazır");
        return true;
      } catch {
        return false;
      }
    }
  }

  private async looksBlocked(page: Page): Promise<boolean> {
    try {
      const title = (await page.title()).toLowerCase();
      const probe = (await page.evaluate(`(() => {
        const text = (document.body && document.body.innerText)
          ? document.body.innerText.slice(0, 2000)
          : "";
        const challengeCount = document.querySelectorAll(
          ".cf-turnstile, #challenge-form, #cf-challenge-running",
        ).length;
        return { text: text, challengeCount: challengeCount };
      })()`)) as { text: string; challengeCount: number };

      const lower = (probe.text ?? "").toLowerCase();

      return (
        title.includes("just a moment") ||
        title.includes("attention required") ||
        title.includes("cloudflare") ||
        lower.includes("checking your browser") ||
        lower.includes("cf-turnstile") ||
        lower.includes("verify you are human") ||
        (probe.challengeCount ?? 0) > 0
      );
    } catch {
      return false;
    }
  }

  private buildSearchUrl(params: ScrapeSearchParams): string {
    const keyword = params.query?.trim() || params.category?.trim() || "";
    const categoryLower = (params.category ?? "").toLocaleLowerCase("tr-TR");

    if (
      categoryLower.includes("otomobil") ||
      categoryLower.includes("vasıta") ||
      categoryLower.includes("vasita")
    ) {
      const search = new URL("https://www.sahibinden.com/otomobil");
      if (keyword) {
        search.searchParams.set("query_text", keyword);
      }
      if (params.city?.trim()) {
        search.searchParams.set("address_city", params.city.trim());
      }
      return search.toString();
    }

    const search = new URL("https://www.sahibinden.com/arama");
    if (keyword) {
      search.searchParams.set("query", keyword);
      search.searchParams.set("query_text", keyword);
    }
    if (params.city?.trim()) {
      search.searchParams.set("address_city", params.city.trim());
    }
    return search.toString();
  }

  /**
   * Live DOM extract from `.searchResultsItem`.
   * String evaluate — Node tsconfig has no DOM lib.
   */
  private async extractDomRows(page: Page): Promise<DomListingRow[]> {
    const rows = await page.evaluate(`(() => {
      const results = [];
      const seen = new Set();
      const nodes = Array.from(
        document.querySelectorAll(".searchResultsItem, tr.searchResultsItem"),
      );

      for (const el of nodes) {
        const linkEl =
          el.querySelector("a.searchResultsTitleValue, a.classifiedTitle") ||
          el.querySelector("td.searchResultsTitleValue a, a[href*='/ilan/']");

        const href =
          (linkEl && (linkEl.getAttribute("href") || linkEl.href)) || null;
        if (!href || !/\\/ilan\\//i.test(href)) {
          continue;
        }

        const absoluteUrl = href.startsWith("http")
          ? href
          : "https://www.sahibinden.com" + (href.startsWith("/") ? "" : "/") + href;

        if (seen.has(absoluteUrl)) {
          continue;
        }
        seen.add(absoluteUrl);

        const idMatch = absoluteUrl.match(/\\/ilan\\/[^/]*-(\\d+)(?:\\?|$)/);
        const dataId =
          el.getAttribute("data-id") ||
          el.getAttribute("data-classified-id") ||
          (idMatch && idMatch[1]) ||
          null;

        const title = linkEl
          ? (linkEl.textContent || "").replace(/\\s+/g, " ").trim()
          : null;

        const priceNode =
          el.querySelector("td.searchResultsPriceValue span") ||
          el.querySelector(".searchResultsPriceValue span") ||
          el.querySelector("td.searchResultsPriceValue") ||
          el.querySelector(".searchResultsPriceValue");
        const priceText = priceNode
          ? (priceNode.textContent || "").replace(/\\s+/g, " ").trim()
          : null;

        const cityNode =
          el.querySelector("td.searchResultsLocationValue") ||
          el.querySelector(".searchResultsLocationValue");
        const city = cityNode
          ? (cityNode.textContent || "").replace(/\\s+/g, " ").trim()
          : null;

        results.push({
          externalId: dataId,
          title: title,
          priceText: priceText,
          city: city,
          url: absoluteUrl,
        });
      }

      return results;
    })()`);

    return Array.isArray(rows) ? (rows as DomListingRow[]) : [];
  }

  private mapRow(
    row: DomListingRow,
    params: ScrapeSearchParams,
  ): RawScrapedListing | null {
    if (!row.url || !row.title) {
      return null;
    }

    const price = this.parsePriceText(row.priceText);
    if (price == null) {
      console.warn(
        `[sahibinden] Fiyat parse edilemedi, satır atlandı → title="${row.title}" priceText="${row.priceText ?? ""}"`,
      );
      return null;
    }

    const id =
      row.externalId ||
      row.url.match(/\/ilan\/[^/]*-(\d+)(?:\?|$)/)?.[1] ||
      row.url;

    const city = this.normalizeCity(row.city) ?? params.city ?? null;

    return this.buildRawListing({
      id,
      title: row.title,
      price,
      url: row.url.split("?")[0] ?? row.url,
      city,
      category: params.category ?? "Vasıta > Otomobil",
      platform: "sahibinden",
    });
  }

  private parsePriceText(raw: string | null | undefined): number | null {
    if (!raw) {
      return null;
    }

    const cleaned = raw
      .replace(/TL/gi, "")
      .replace(/₺/g, "")
      .replace(/\u00a0/g, " ")
      .trim();

    const digits = cleaned.replace(/[^\d.,]/g, "");
    if (!digits) {
      return null;
    }

    let normalized = digits;
    if (digits.includes(",") && digits.includes(".")) {
      normalized = digits.replace(/\./g, "").replace(",", ".");
    } else if (/^\d{1,3}(\.\d{3})+$/.test(digits)) {
      normalized = digits.replace(/\./g, "");
    } else if (digits.includes(",")) {
      const parts = digits.split(",");
      normalized =
        parts.length === 2 && (parts[1]?.length ?? 0) <= 2
          ? `${parts[0]!.replace(/\./g, "")}.${parts[1]}`
          : digits.replace(/,/g, "");
    }

    const value = Number.parseFloat(normalized);
    return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
  }

  private normalizeCity(raw: string | null): string | null {
    if (!raw) {
      return null;
    }
    const primary = raw.split(/[\/|,]/)[0]?.trim();
    return primary && primary.length > 0 ? primary : null;
  }
}

export const sahibindenAdapter = new SahibindenAdapter();
