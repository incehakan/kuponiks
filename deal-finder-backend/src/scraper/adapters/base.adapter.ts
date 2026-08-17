import type { AxiosResponse } from "axios";
import { env } from "../../config/env.js";
import {
  proxyService,
  type ProxyService,
} from "../proxy.service.js";
import type { RawScrapedListing } from "../normalizer.js";

export interface ScrapeSearchParams {
  category?: string;
  city?: string;
  limit?: number;
  query?: string;
  /** When set, adapter uses this URL instead of building its own. */
  scrapeUrl?: string;
}

const MIN_DELAY_MS = 1_000;
const MAX_DELAY_MS = 3_500;
const DEFAULT_MAX_RETRIES = 3;

/**
 * Abstract marketplace scraper with anti-bot primitives:
 * User-Agent rotation, random delays, and retry with backoff.
 */
export abstract class BaseScraperAdapter {
  abstract readonly platform: string;

  constructor(protected readonly http: ProxyService = proxyService) {}

  /**
   * Fetches raw listings for the given search params.
   */
  abstract search(params: ScrapeSearchParams): Promise<RawScrapedListing[]>;

  /**
   * Random wait between 1000ms and 3500ms (anti-bot pacing).
   */
  protected async randomDelay(
    minMs: number = MIN_DELAY_MS,
    maxMs: number = MAX_DELAY_MS,
  ): Promise<void> {
    const span = Math.max(0, maxMs - minMs);
    const wait = minMs + Math.floor(Math.random() * (span + 1));
    await new Promise((resolve) => setTimeout(resolve, wait));
  }

  /**
   * Rotates to a fresh mobile User-Agent via ProxyService.
   */
  protected nextUserAgent(): string {
    return this.http.getRandomUserAgent();
  }

  /**
   * GET with UA rotation, pre-request delay, and retry with backoff.
   * On timeout / 403 / captcha, ProxyService rotates to a fresh exit IP.
   */
  protected async fetchWithRetry(
    url: string,
    options: {
      maxRetries?: number;
      accept?: string;
      headers?: Record<string, string>;
    } = {},
  ): Promise<AxiosResponse<string>> {
    const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      await this.randomDelay();

      try {
        const userAgent = this.nextUserAgent();
        console.log(
          `[${this.platform}] GET attempt=${attempt}/${maxRetries} ua=${userAgent.slice(0, 40)}… url=${url}`,
        );

        const response = await this.http.getWithRotation<string>(
          url,
          {
            responseType: "text",
            headers: {
              "User-Agent": userAgent,
              Accept:
                options.accept ??
                "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
              "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
              "Cache-Control": "no-cache",
              Pragma: "no-cache",
              ...(options.headers ?? {}),
            },
            validateStatus: (status) => status >= 200 && status < 500,
          },
          1,
        );

        if (response.status === 403 || response.status === 429) {
          throw new Error(`HTTP ${response.status}`);
        }

        if (response.status >= 400) {
          throw new Error(`HTTP ${response.status}`);
        }

        const body = typeof response.data === "string" ? response.data : "";
        if (
          /captcha|cloudflare|access denied|just a moment/i.test(body.slice(0, 2000))
        ) {
          throw new Error("Captcha/Cloudflare challenge detected");
        }

        return response;
      } catch (error) {
        lastError = error;
        const message =
          error instanceof Error ? error.message : "Unknown fetch error";
        console.warn(
          `[${this.platform}] İstek başarısız (attempt ${attempt}/${maxRetries}) — yeni IP ile retry: ${message}`,
        );

        if (attempt < maxRetries) {
          await this.randomDelay(1_500, 4_000);
        }
      }
    }

    const finalMessage =
      lastError instanceof Error ? lastError.message : "Unknown fetch error";
    throw new Error(
      `[${this.platform}] fetchWithRetry exhausted for ${url}: ${finalMessage}`,
    );
  }

  /**
   * Extracts an embedded JSON blob (e.g. __NEXT_DATA__, ld+json) when present.
   */
  protected extractJsonScript(
    html: string,
    scriptIdOrType: string,
  ): unknown | null {
    const byId = new RegExp(
      `<script[^>]*id=["']${scriptIdOrType}["'][^>]*>([\\s\\S]*?)</script>`,
      "i",
    );
    const byType = new RegExp(
      `<script[^>]*type=["']${scriptIdOrType}["'][^>]*>([\\s\\S]*?)</script>`,
      "i",
    );

    const match = html.match(byId) ?? html.match(byType);
    if (!match?.[1]) {
      return null;
    }

    try {
      return JSON.parse(match[1].trim()) as unknown;
    } catch {
      return null;
    }
  }

  /**
   * Extracts all script bodies matching id or type (sites often emit multiple ld+json).
   */
  protected extractAllJsonScripts(
    html: string,
    scriptIdOrType: string,
  ): unknown[] {
    const byId = new RegExp(
      `<script[^>]*id=["']${scriptIdOrType}["'][^>]*>([\\s\\S]*?)</script>`,
      "gi",
    );
    const byType = new RegExp(
      `<script[^>]*type=["']${scriptIdOrType}["'][^>]*>([\\s\\S]*?)</script>`,
      "gi",
    );

    const out: unknown[] = [];
    for (const re of [byId, byType]) {
      let match: RegExpExecArray | null;
      while ((match = re.exec(html)) !== null) {
        const body = match[1]?.trim();
        if (!body) {
          continue;
        }
        try {
          out.push(JSON.parse(body) as unknown);
        } catch {
          // ignore malformed script
        }
      }
    }
    return out;
  }

  protected clampLimit(limit: number | undefined, fallback = 30): number {
    if (limit == null || !Number.isFinite(limit)) {
      return fallback;
    }
    return Math.min(Math.max(1, Math.floor(limit)), 100);
  }

  protected isNonProduction(): boolean {
    return env.NODE_ENV !== "production";
  }

  /**
   * Mock/fallback listings only when explicitly enabled outside production.
   */
  protected areMockListingsEnabled(): boolean {
    return this.isNonProduction() && env.ENABLE_MOCK_LISTINGS === true;
  }

  /**
   * Target pricing so discount ≈26% → dealScore ≈92 (85+),
   * and listing sits inside a typical 850k–1M user budget filter.
   * ONLY used for mock/dev fallback samples — never mutates live scrape prices.
   */
  protected static readonly KELEPIR_TEST_PRICE = 920_000;
  protected static readonly KELEPIR_TEST_MARKET = 1_250_000;

  /**
   * Overwrites price / marketAveragePrice for MOCK samples only.
   */
  protected withKelepirPricing(
    listings: RawScrapedListing[],
    params: ScrapeSearchParams = {},
  ): RawScrapedListing[] {
    const keyword = params.query?.trim();

    return listings.map((item, index) => {
      const price = BaseScraperAdapter.KELEPIR_TEST_PRICE;
      const market = BaseScraperAdapter.KELEPIR_TEST_MARKET;

      const titled =
        keyword && typeof item.title === "string" && !item.title.includes(keyword)
          ? `${keyword} — ${item.title}`
          : item.title;

      const next = this.buildRawListing({
        id: (item.id as string | number | undefined) ?? `${this.platform}-${index + 1}`,
        title: titled ?? item.title,
        price,
        url: item.url,
        city: item.city ?? params.city ?? "İzmir",
        category: item.category ?? params.category ?? "Vasıta > Otomobil",
        description: item.description,
        platform: item.platform ?? this.platform,
      });
      next.marketAveragePrice = market;
      next.piyasaOrt = market;
      return next;
    });
  }

  /**
   * Returns live listings unchanged. Empty live results may yield mock samples
   * only when ENABLE_MOCK_LISTINGS=true and NODE_ENV !== production.
   */
  protected resolveListingsOrDevFallback(
    listings: RawScrapedListing[],
    params: ScrapeSearchParams,
    meta: { htmlLength: number; reason?: string },
  ): RawScrapedListing[] {
    if (listings.length > 0) {
      // Production safety: never rewrite live scrape prices for test scoring.
      return listings;
    }

    const reason = meta.reason ?? "ilan bulunamadı";
    console.warn(
      `[${this.platform}] Parse sonucu boş (${reason}, htmlLen=${meta.htmlLength})`,
    );

    if (!this.areMockListingsEnabled()) {
      return [];
    }

    const fallback = this.withKelepirPricing(
      this.buildDevFallbackListings(params),
      params,
    );
    console.warn(
      `[${this.platform}] DEV MOCK FALLBACK → ${fallback.length} örnek ilan (ENABLE_MOCK_LISTINGS=true)`,
    );
    return fallback;
  }

  /**
   * Shape-compatible sample listings for local scrape → normalize → ingest tests.
   */
  protected buildDevFallbackListings(
    params: ScrapeSearchParams,
  ): RawScrapedListing[] {
    const keyword = params.query?.trim() || "Honda Civic";
    const city = params.city?.trim() || "İzmir";
    const category = params.category?.trim() || "Vasıta > Otomobil";
    const stamp = Date.now();
    const count = Math.min(this.clampLimit(params.limit), 5);

    const samples: RawScrapedListing[] = [];
    for (let i = 0; i < count; i += 1) {
      const id = `${this.platform}-dev-${stamp}-${i + 1}`;

      samples.push(
        this.buildRawListing({
          id,
          title: `${keyword} ${2020 + i} hatasız acil satılık — ${this.platform} kelepir #${i + 1}`,
          price: BaseScraperAdapter.KELEPIR_TEST_PRICE,
          url: `https://www.${this.platform === "arabam" ? "arabam.com" : "letgo.com"}/dev-fallback/${id}`,
          city,
          category,
          description: `DEV FALLBACK kelepir listing for ${this.platform} (keyword=${keyword})`,
          platform: this.platform,
        }),
      );
    }

    return samples;
  }

  /**
   * Builds a RawScrapedListing without undefined optional keys
   * (required when exactOptionalPropertyTypes is enabled).
   */
  protected buildRawListing(fields: {
    id?: string | number | null | undefined;
    title?: string | null | undefined;
    price?: string | number | null | undefined;
    url?: string | null | undefined;
    city?: string | null | undefined;
    district?: string | null | undefined;
    category?: string | null | undefined;
    subcategory?: string | null | undefined;
    description?: string | null | undefined;
    platform?: string | null | undefined;
    currency?: string | null | undefined;
    imageUrl?: string | null | undefined;
    sellerType?: string | null | undefined;
    publishedAt?: string | Date | null | undefined;
    brand?: string | null | undefined;
    model?: string | null | undefined;
    variant?: string | null | undefined;
    year?: string | number | null | undefined;
    mileage?: string | number | null | undefined;
    fuelType?: string | null | undefined;
    transmission?: string | null | undefined;
  }): RawScrapedListing {
    const raw: RawScrapedListing = {};

    if (fields.id != null && fields.id !== "") {
      raw.id = fields.id;
    }
    if (fields.title) {
      raw.title = fields.title;
    }
    if (fields.price != null && fields.price !== "") {
      raw.price = fields.price;
    }
    if (fields.url) {
      raw.url = fields.url;
    }
    if (fields.city) {
      raw.city = fields.city;
    }
    if (fields.district) {
      raw.district = fields.district;
    }
    if (fields.category) {
      raw.category = fields.category;
    }
    if (fields.subcategory) {
      raw.subcategory = fields.subcategory;
    }
    if (fields.description) {
      raw.description = fields.description;
    }
    if (fields.platform) {
      raw.platform = fields.platform;
    }
    if (fields.currency) {
      raw.currency = fields.currency;
    }
    if (fields.imageUrl) {
      raw.imageUrl = fields.imageUrl;
    }
    if (fields.sellerType) {
      raw.sellerType = fields.sellerType;
    }
    if (fields.publishedAt) {
      raw.publishedAt = fields.publishedAt;
    }
    if (fields.brand) {
      raw.brand = fields.brand;
    }
    if (fields.model) {
      raw.model = fields.model;
    }
    if (fields.variant) {
      raw.variant = fields.variant;
    }
    if (fields.year != null && fields.year !== "") {
      raw.year = fields.year;
    }
    if (fields.mileage != null && fields.mileage !== "") {
      raw.mileage = fields.mileage;
    }
    if (fields.fuelType) {
      raw.fuelType = fields.fuelType;
    }
    if (fields.transmission) {
      raw.transmission = fields.transmission;
    }

    return raw;
  }
}
