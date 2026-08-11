import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import {
  enqueueScrapeJob,
  type ScrapePlatform,
} from "../queues/scraper.queue.js";
import { isRedisAvailable } from "../lib/redis.js";

const TEST_PLATFORMS = new Set<ScrapePlatform>([
  "arabam",
  "letgo",
  "sahibinden",
  "hepsiemlak",
]);

interface TriggerTestBody {
  platform?: string;
  keyword?: string;
  query?: string;
  city?: string;
  category?: string;
  limit?: number;
}

/**
 * Live scraper test / ops routes.
 */
export const scraperRoutes: FastifyPluginAsync = async (
  app: FastifyInstance,
) => {
  /**
   * POST /api/scraper/trigger-test
   * Enqueues an immediate scrape job for arabam | letgo | sahibinden | hepsiemlak.
   * Keyword is forwarded to the adapter as `query` for title/search matching.
   */
  app.post("/trigger-test", async (request, reply) => {
    const body = (request.body ?? {}) as TriggerTestBody;
    const platformRaw = body.platform?.trim().toLowerCase();
    // Prefer explicit `keyword`; fall back to `query` alias.
    const keyword = (body.keyword ?? body.query)?.trim() || undefined;

    if (!platformRaw || !TEST_PLATFORMS.has(platformRaw as ScrapePlatform)) {
      return reply.status(400).send({
        statusCode: 400,
        error: "ValidationError",
        message:
          'platform "arabam", "letgo", "sahibinden" veya "hepsiemlak" olmalıdır.',
      });
    }

    if (!isRedisAvailable()) {
      return reply.status(503).send({
        statusCode: 503,
        error: "ServiceUnavailable",
        message:
          "Redis kapalı — scraper-queue'ya iş eklenemedi. Redis'i başlatıp tekrar deneyin.",
      });
    }

    const platform = platformRaw as ScrapePlatform;
    const jobId = await enqueueScrapeJob({
      platform,
      triggeredBy: "manual",
      limit: body.limit ?? 10,
      // Keyword goes straight to adapter.search({ query })
      ...(keyword ? { query: keyword } : {}),
      ...(body.city?.trim() ? { city: body.city.trim() } : {}),
      ...(body.category?.trim() ? { category: body.category.trim() } : {}),
    });

    if (!jobId) {
      return reply.status(503).send({
        statusCode: 503,
        error: "ServiceUnavailable",
        message: "scraper-queue'ya iş eklenemedi. Redis/BullMQ durumunu kontrol edin.",
      });
    }

    console.log("══════════════════════════════════════════════════════════");
    console.log("[SCRAPER TEST] trigger-test KUYRUĞA EKLENDİ");
    console.log(`  jobId     = ${jobId}`);
    console.log(`  platform  = ${platform}`);
    console.log(`  keyword   = ${keyword ?? "(yok)"}  → adaptöre query olarak aktarılacak`);
    console.log("  beklenen  = price≈920.000 TL | market=1.250.000 TL | skor≈92 | ~%26 indirim");
    console.log("  filtre    = min≈850k – max≈1M bütçe bandına oturmalı");
    console.log("  sonraki   = worker → adaptör → normalize → ingest → ★ KELEPİR EŞLEŞME logları");
    console.log("══════════════════════════════════════════════════════════");

    return reply.status(202).send({
      ok: true,
      message: "Scrape job kuyruğa eklendi. Worker kelepir eşleşmesini konsola yazacak.",
      jobId,
      platform,
      keyword: keyword ?? null,
      expectedPricing: {
        price: 920_000,
        marketAveragePrice: 1_250_000,
        approxDiscountPercent: 26.4,
        approxDealScore: 92,
      },
      queue: "scraper-queue",
    });
  });
};
