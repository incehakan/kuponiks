import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { optionalAuthenticate } from "../../middlewares/auth.middleware.js";
import { env } from "../../config/env.js";
import { mockListingService } from "../../services/mockListing.service.js";
import { listingAlertNotificationService } from "../../services/notification.service.js";
import { dealService } from "./deal.service.js";

/**
 * Kelepir listing feed routes (public feed; optional JWT for future personalization).
 */
export const dealRoutes: FastifyPluginAsync = async (
  app: FastifyInstance,
) => {
  app.get(
    "/",
    {
      preHandler: [optionalAuthenticate],
    },
    async (request, reply) => {
      const deals = await dealService.getHighScoreDeals();
      return reply.status(200).send({
        deals,
        authenticated: Boolean(request.user?.id),
      });
    },
  );

  app.get(
    "/:id",
    {
      preHandler: [optionalAuthenticate],
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", format: "uuid" },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const deal = await dealService.getDealById(id);
      return reply.status(200).send({ deal });
    },
  );

  /**
   * Development-only seeder: inserts 3 default kelepir listings and notifies matches.
   * Auth is intentionally disabled for local testing.
   */
  app.post("/generate-mock", async (_request, reply) => {
    if (env.NODE_ENV === "production" || !env.ENABLE_MOCK_LISTINGS) {
      return reply.status(403).send({
        message:
          "Mock ilan üretimi kapalı. NODE_ENV!==production ve ENABLE_MOCK_LISTINGS=true gerekli.",
      });
    }

    const listings = await mockListingService.createDefaultMockBatch();

    for (const listing of listings) {
      await listingAlertNotificationService.notifyMatchingFilters(listing);
    }

    return reply.status(201).send({
      success: true,
      count: listings.length,
    });
  });
};
