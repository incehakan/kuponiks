import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { env } from "../config/env.js";
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
   * Development-only: enqueues an immediate scrape job.
   * Disabled in production (no anonymous scrape triggering).
   */
  app.post("/trigger-test", async (request, reply) => {
    if (env.NODE_ENV === "production") {
      return reply.status(403).send({
        statusCode: 403,
        error: "Forbidden",
        message: "Scraper test endpoint production ortamında kapalıdır.",
      });
    }

    const body = (request.body ?? {}) as TriggerTestBody;
    const platformRaw = body.platform?.trim().toLowerCase();
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

    console.log(
      `[SCRAPER TEST] trigger-test jobId=${jobId} platform=${platform} keyword=${keyword ?? "-"}`,
    );

    return reply.status(202).send({
      ok: true,
      message: "Scrape job kuyruğa eklendi.",
      jobId,
      platform,
      keyword: keyword ?? null,
      queue: "scraper-queue",
    });
  });
};
