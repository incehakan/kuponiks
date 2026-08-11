import type { RawScrapedListing } from "../normalizer.js";
import {
  BaseScraperAdapter,
  type ScrapeSearchParams,
} from "./base.adapter.js";

/**
 * Letgo / classifieds adapter.
 * Prefers embedded JSON payloads; falls back to resilient HTML heuristics
 * and non-production sample listings when the site returns empty/blocked HTML.
 */
export class LetgoAdapter extends BaseScraperAdapter {
  readonly platform = "letgo";

  async search(params: ScrapeSearchParams): Promise<RawScrapedListing[]> {
    const limit = this.clampLimit(params.limit);
    const url = this.buildSearchUrl(params);

    try {
      const response = await this.fetchWithRetry(url);
      const html =
        typeof response.data === "string"
          ? response.data
          : String(response.data ?? "");
      const htmlLength = html.trim().length;

      if (htmlLength < 200) {
        console.warn(
          `[letgo] HTML çok kısa/boş (len=${htmlLength}) — selector zinciri + fallback`,
        );
        return this.resolveListingsOrDevFallback([], params, {
          htmlLength,
          reason: "boş veya bot-koruma HTML",
        });
      }

      const fromNext = this.parseNextData(html, params, limit);
      if (fromNext.length > 0) {
        console.log(`[letgo] __NEXT_DATA__ ile ${fromNext.length} ilan çıkarıldı`);
        return fromNext;
      }

      const fromLd = this.parseJsonLd(html, params, limit);
      if (fromLd.length > 0) {
        console.log(`[letgo] JSON-LD ile ${fromLd.length} ilan çıkarıldı`);
        return fromLd;
      }

      const fromHtml = this.parseHtmlCards(html, params, limit);
      if (fromHtml.length > 0) {
        console.log(`[letgo] HTML heuristic ile ${fromHtml.length} ilan çıkarıldı`);
        return fromHtml;
      }

      const fromLinks = this.parseListingLinks(html, params, limit);
      if (fromLinks.length > 0) {
        console.log(`[letgo] Link-only parse ile ${fromLinks.length} ilan çıkarıldı`);
        return fromLinks;
      }

      return this.resolveListingsOrDevFallback([], params, {
        htmlLength,
        reason: "JSON/HTML selector eşleşmedi",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown letgo scrape error";
      console.error(`[letgo] Arama başarısız: ${message}`);
      return this.resolveListingsOrDevFallback([], params, {
        htmlLength: 0,
        reason: `fetch hata: ${message}`,
      });
    }
  }

  private buildSearchUrl(params: ScrapeSearchParams): string {
    const search = new URL("https://www.letgo.com/tr-tr");
    const qParts = [params.query, params.category, params.city]
      .map((part) => part?.trim())
      .filter(Boolean);

    if (qParts.length > 0) {
      search.searchParams.set("search", qParts.join(" "));
      search.searchParams.set("q", qParts.join(" "));
    }
    if (params.city?.trim()) {
      search.searchParams.set("city", params.city.trim());
    }
    if (params.category?.trim()) {
      search.searchParams.set("category", params.category.trim());
    }

    return search.toString();
  }

  private parseNextData(
    html: string,
    params: ScrapeSearchParams,
    limit: number,
  ): RawScrapedListing[] {
    const parsed = this.extractJsonScript(html, "__NEXT_DATA__");
    if (!parsed || typeof parsed !== "object") {
      return [];
    }

    const collected: RawScrapedListing[] = [];
    this.walkForListings(parsed, collected, limit);

    return collected.slice(0, limit).map((item) =>
      this.buildRawListing({
        ...item,
        platform: "letgo",
        category: item.category ?? params.category ?? null,
        city: item.city ?? params.city ?? null,
      }),
    );
  }

  private walkForListings(
    node: unknown,
    out: RawScrapedListing[],
    limit: number,
  ): void {
    if (out.length >= limit || node == null) {
      return;
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        this.walkForListings(item, out, limit);
        if (out.length >= limit) {
          return;
        }
      }
      return;
    }

    if (typeof node !== "object") {
      return;
    }

    const record = node as Record<string, unknown>;
    const title =
      (typeof record.title === "string" && record.title) ||
      (typeof record.name === "string" && record.name) ||
      null;
    const price =
      record.price ??
      record.amount ??
      (record.priceInfo as { price?: unknown } | undefined)?.price;
    const id = record.id ?? record.listingId ?? record.adId;
    const url =
      (typeof record.url === "string" && record.url) ||
      (typeof record.seoUrl === "string" && record.seoUrl) ||
      (typeof record.slug === "string" &&
        `https://www.letgo.com${record.slug.startsWith("/") ? "" : "/"}${record.slug}`) ||
      null;

    if (title && price != null && (id != null || url)) {
      out.push(
        this.buildRawListing({
          id: id as string | number,
          title,
          price: price as number | string,
          url,
          city:
            (typeof record.city === "string" && record.city) ||
            (typeof record.location === "string" && record.location) ||
            null,
          category:
            (typeof record.category === "string" && record.category) ||
            (typeof record.categoryName === "string" && record.categoryName) ||
            null,
          description:
            (typeof record.description === "string" && record.description) ||
            null,
          platform: "letgo",
        }),
      );
    }

    for (const value of Object.values(record)) {
      if (typeof value === "object" && value !== null) {
        this.walkForListings(value, out, limit);
        if (out.length >= limit) {
          return;
        }
      }
    }
  }

  private parseJsonLd(
    html: string,
    params: ScrapeSearchParams,
    limit: number,
  ): RawScrapedListing[] {
    const blobs = this.extractAllJsonScripts(html, "application/ld\\+json");
    if (blobs.length === 0) {
      return [];
    }

    const results: RawScrapedListing[] = [];

    for (const parsed of blobs) {
      const nodes = Array.isArray(parsed) ? parsed : [parsed];

      for (const node of nodes) {
        if (!node || typeof node !== "object") {
          continue;
        }
        const record = node as Record<string, unknown>;
        const graph = Array.isArray(record["@graph"])
          ? (record["@graph"] as unknown[])
          : [record];

        for (const item of graph) {
          if (!item || typeof item !== "object") {
            continue;
          }
          const offer = item as Record<string, unknown>;
          const type = String(offer["@type"] ?? "");
          if (
            !/product|offer|vehicle|itemlist/i.test(type) &&
            !offer.name &&
            !offer.title
          ) {
            continue;
          }

          // ItemList → walk elements
          if (/itemlist/i.test(type) && Array.isArray(offer.itemListElement)) {
            this.walkForListings(offer.itemListElement, results, limit);
            if (results.length >= limit) {
              return results.slice(0, limit);
            }
            continue;
          }

          const offers =
            offer.offers && typeof offer.offers === "object"
              ? (offer.offers as Record<string, unknown>)
              : null;

          const built = this.buildRawListing({
            id: (offer.sku ?? offer.productID ?? offer.url) as
              | string
              | number
              | null
              | undefined,
            title: (offer.name ?? offer.title) as string | null | undefined,
            price: (offers?.price ?? offer.price) as
              | string
              | number
              | null
              | undefined,
            url: offer.url as string | null | undefined,
            description: offer.description as string | null | undefined,
            platform: "letgo",
            category: params.category ?? null,
            city: params.city ?? null,
          });

          if (built.title && built.price != null) {
            results.push(built);
          }

          if (results.length >= limit) {
            return results;
          }
        }
      }
    }

    return results;
  }

  private parseHtmlCards(
    html: string,
    params: ScrapeSearchParams,
    limit: number,
  ): RawScrapedListing[] {
    const results: RawScrapedListing[] = [];
    const seen = new Set<string>();

    const patterns: RegExp[] = [
      /href=["'](https?:\/\/[^"']*letgo[^"']+|\/(?:item|ilan|ad)\/[^"']+)["'][^>]*>[\s\S]{0,600}?(\d{1,3}(?:[.\s]\d{3})+|\d{4,})\s*(?:TL|₺)/gi,
      /data-(?:href|url)=["'](https?:\/\/[^"']*letgo[^"']+|\/[^"']+)["'][\s\S]{0,400}?(\d{1,3}(?:[.\s]\d{3})+)\s*(?:TL|₺)/gi,
      /"url"\s*:\s*"(https?:\\\/\\\/[^"]*letgo[^"]+)"[\s\S]{0,300}?"(?:price|amount)"\s*:\s*"?(\d[\d.\s,]*)"?/gi,
    ];

    for (const cardRegex of patterns) {
      let match: RegExpExecArray | null;
      while ((match = cardRegex.exec(html)) !== null && results.length < limit) {
        let href = match[1];
        const price = match[2];
        if (!href || !price) {
          continue;
        }

        href = href.replace(/\\\//g, "/");
        const absoluteUrl = href.startsWith("http")
          ? href
          : `https://www.letgo.com${href.startsWith("/") ? "" : "/"}${href}`;

        if (seen.has(absoluteUrl)) {
          continue;
        }
        seen.add(absoluteUrl);

        results.push(
          this.buildRawListing({
            id: absoluteUrl,
            title:
              this.guessTitleNearHref(html, href) ??
              `Letgo ilan ${results.length + 1}`,
            price,
            url: absoluteUrl,
            platform: "letgo",
            category: params.category ?? null,
            city: params.city ?? null,
          }),
        );
      }
    }

    return results;
  }

  private parseListingLinks(
    html: string,
    params: ScrapeSearchParams,
    limit: number,
  ): RawScrapedListing[] {
    const results: RawScrapedListing[] = [];
    const seen = new Set<string>();
    const linkRe =
      /(?:href|data-href)=["'](https?:\/\/(?:www\.)?letgo\.com[^"'#?]+|\/(?:item|ilan|ad)\/[^"'#?]+)/gi;

    let match: RegExpExecArray | null;
    let index = 0;
    while ((match = linkRe.exec(html)) !== null && results.length < limit) {
      const href = match[1];
      if (!href) {
        continue;
      }
      const absoluteUrl = href.startsWith("http")
        ? href
        : `https://www.letgo.com${href.startsWith("/") ? "" : "/"}${href}`;

      // Skip bare homepage / category shells
      if (/letgo\.com\/?(tr-tr)?\/?$/i.test(absoluteUrl)) {
        continue;
      }
      if (seen.has(absoluteUrl)) {
        continue;
      }
      seen.add(absoluteUrl);
      index += 1;

      // Link-only rows have no reliable price — do not invent KELEPIR test prices.
      const title =
        this.guessTitleNearHref(html, href) ??
        `${params.query ?? "İlan"} #${index}`;
      console.warn(
        `[letgo] Link-only satır atlandı (fiyat yok) → "${title.slice(0, 60)}"`,
      );
    }

    return results;
  }

  private guessTitleNearHref(html: string, pathOrUrl: string): string | null {
    const escaped = pathOrUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`${escaped}[^>]*>\\s*([^<]{8,120})\\s*<`, "i");
    const match = html.match(re);
    const title = match?.[1]?.replace(/\s+/g, " ").trim();
    if (!title || /tl|₺|fiyat/i.test(title)) {
      return null;
    }
    return title;
  }
}

export const letgoAdapter = new LetgoAdapter();
