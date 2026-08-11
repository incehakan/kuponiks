import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import {
  authenticate,
  optionalAuthenticate,
} from "../../middlewares/auth.middleware.js";
import { env } from "../../config/env.js";
import { mockListingService } from "../../services/mockListing.service.js";
import { listingAlertNotificationService } from "../../services/notification.service.js";
import { dealService } from "./deal.service.js";

/**
 * Deal Feed V2 — authenticated user-specific matches.
 * Unauthenticated GET / returns empty feed (no global leakage).
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
      if (!request.user?.id) {
        return reply.status(200).send({
          deals: [],
          authenticated: false,
          nextCursor: null,
          message: "Fırsat listeniz için giriş yapın.",
        });
      }

      const query = request.query as {
        limit?: string;
        cursor?: string;
        sort?: string;
      };
      const limit = query.limit ? Number(query.limit) : 20;
      const sort = query.sort === "score" ? "score" : "newest";

      const page = await dealService.getUserMatchedDeals(request.user.id, {
        limit: Number.isFinite(limit) ? limit : 20,
        ...(query.cursor ? { cursor: query.cursor } : {}),
        sort,
      });

      return reply.status(200).send(page);
    },
  );

  /**
   * Optional global highlight feed (dealScore >= global threshold).
   * Not used as the primary Home feed.
   */
  app.get(
    "/highlights",
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
      preHandler: [authenticate],
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
      const deal = await dealService.getUserDealById(request.user!.id, id);
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
