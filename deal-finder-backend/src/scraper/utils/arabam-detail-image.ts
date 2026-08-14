/**
 * Arabam detail-page photo extraction. No Cloudflare/captcha bypass.
 * Used only when list HTML has no real listing photo.
 */
import type { Browser, Page } from "puppeteer";
import {
  pickBestListingImage,
  toStoredListingImageUrl,
  type ListingImageSource,
} from "../../lib/listing-image.js";
import { prepareStealthPage } from "../puppeteer/stealth-browser.js";

export const ARABAM_DETAIL_IMAGE_SCRIPT = `(() => {
  const og = document.querySelector('meta[property="og:image"]');
  const twitter = document.querySelector('meta[name="twitter:image"]');
  const ldImages = [];
  for (const s of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      const parsed = JSON.parse(s.textContent || "null");
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const type = item["@type"];
        const types = Array.isArray(type) ? type : [type];
        const vehicleLike =
          types.indexOf("Vehicle") !== -1 || types.indexOf("Car") !== -1;
        if (!vehicleLike || !item.image) continue;
        const images = Array.isArray(item.image) ? item.image : [item.image];
        for (const image of images) {
          if (typeof image === "string") ldImages.push(image);
          else if (image && typeof image === "object" && image.url) ldImages.push(image.url);
        }
      }
    } catch (_) {}
  }
  const gallery = Array.from(
    document.querySelectorAll(
      "img.swiper-main-img, .swiper-slide img, .photo-gallery img",
    ),
  ).map((img) => ({
    src: img.getAttribute("src"),
    dataSrc: img.getAttribute("data-src"),
    dataOriginal: img.getAttribute("data-original"),
    dataLazy: img.getAttribute("data-lazy"),
  }));
  return {
    ldImages,
    ogImage: og ? og.getAttribute("content") : null,
    twitterImage: twitter ? twitter.getAttribute("content") : null,
    gallery,
  };
})()`;

export interface ArabamDetailImageResult {
  url: string;
  source: ListingImageSource;
}

interface DetailDomDump {
  ldImages?: unknown;
  ogImage?: unknown;
  twitterImage?: unknown;
  gallery?: Array<{
    src?: string | null;
    dataSrc?: string | null;
    dataOriginal?: string | null;
    dataLazy?: string | null;
  }>;
}

export function pickArabamDetailImage(
  dump: DetailDomDump,
): ArabamDetailImageResult | null {
  const ld = Array.isArray(dump.ldImages)
    ? dump.ldImages.filter((item): item is string => typeof item === "string")
    : [];
  const gallery = dump.gallery ?? [];
  const picked = pickBestListingImage(
    [
      ...ld.map((url) => ({ url, source: "detail-json-ld" as const })),
      { url: typeof dump.ogImage === "string" ? dump.ogImage : null, source: "detail-og" },
      {
        url: typeof dump.twitterImage === "string" ? dump.twitterImage : null,
        source: "detail-og",
      },
      ...gallery.flatMap((img) => [
        { url: img.dataOriginal, source: "detail-gallery" as const },
        { url: img.dataSrc, source: "detail-gallery" as const },
        { url: img.dataLazy, source: "detail-gallery" as const },
        { url: img.src, source: "detail-gallery" as const },
      ]),
    ],
    "https://www.arabam.com",
  );
  return picked;
}

export async function extractArabamDetailImageFromPage(
  page: Page,
): Promise<ArabamDetailImageResult | null> {
  const dump = (await page.evaluate(ARABAM_DETAIL_IMAGE_SCRIPT)) as DetailDomDump;
  return pickArabamDetailImage(dump);
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchArabamDetailImage(
  browser: Browser,
  listingUrl: string,
  timeoutMs = 20_000,
): Promise<ArabamDetailImageResult | null> {
  const page = await browser.newPage();
  try {
    await prepareStealthPage(page);
    await page.goto(listingUrl, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    await delay(800);
    return await extractArabamDetailImageFromPage(page);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[arabam] detail image fetch failed → ${listingUrl}: ${message}`);
    return null;
  } finally {
    await page.close().catch(() => undefined);
  }
}

export async function enrichArabamRowsMissingImages(
  browser: Browser,
  rows: Array<{ url: string | null; imageUrl?: string | null; imageSource?: string | null }>,
  options: { max?: number; concurrency?: number } = {},
): Promise<void> {
  const max = options.max ?? 8;
  const concurrency = Math.max(1, options.concurrency ?? 2);
  const missing = rows.filter(
    (row) => row.url && !toStoredListingImageUrl(row.imageUrl),
  );
  const batch = missing.slice(0, max);
  let index = 0;

  const worker = async (): Promise<void> => {
    while (index < batch.length) {
      const current = index;
      index += 1;
      const row = batch[current];
      if (!row?.url) {
        continue;
      }
      await delay(400 + Math.floor(Math.random() * 700));
      const photo = await fetchArabamDetailImage(browser, row.url);
      if (photo) {
        row.imageUrl = photo.url;
        row.imageSource = photo.source;
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, batch.length) }, () => worker()),
  );
}
