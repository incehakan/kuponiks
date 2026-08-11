import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import {
  authenticate,
  optionalAuthenticate,
} from "../../middlewares/auth.middleware.js";
import { filterService } from "./filter.service.js";

/**
 * Filter management routes.
 * GET is public (empty list without auth); mutations require JWT.
 */
export const filterRoutes: FastifyPluginAsync = async (
  app: FastifyInstance,
) => {
  /**
   * Public listing endpoint:
   * - With valid JWT → user's active filters
   * - Without JWT → empty filters (categories/cities remain on their own public routes)
   */
  app.get(
    "/",
    {
      preHandler: [optionalAuthenticate],
    },
    async (request, reply) => {
      if (!request.user?.id) {
        return reply.status(200).send({
          filters: [],
          authenticated: false,
          message:
            "Filtre listesi için giriş yapın. Kategori/şehir katalogları /api/categories ve /api/cities üzerinden açıktır.",
        });
      }

      const filters = await filterService.getUserFilters(request.user!.id);
      return reply.status(200).send({ filters, authenticated: true });
    },
  );

  app.post(
    "/",
    {
      preHandler: [authenticate],
      schema: {
        body: {
          type: "object",
          required: ["category"],
          additionalProperties: false,
          properties: {
            category: { type: "string", minLength: 1, maxLength: 120 },
            city: { type: "string", maxLength: 500 },
            minPrice: { type: "number", minimum: 0 },
            maxPrice: { type: "number", minimum: 0 },
            keywords: {
              anyOf: [
                { type: "string", maxLength: 500 },
                {
                  type: "array",
                  maxItems: 50,
                  items: { type: "string", minLength: 1, maxLength: 80 },
                },
              ],
            },
            minDealScore: { type: "integer", minimum: 0, maximum: 100 },
            notifyTelegram: { type: "boolean" },
            notifyPush: { type: "boolean" },
            notifyWhatsapp: { type: "boolean" },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as {
        category: string;
        city?: string;
        minPrice?: number;
        maxPrice?: number;
        keywords?: string | string[];
        minDealScore?: number;
        notifyTelegram?: boolean;
        notifyPush?: boolean;
        notifyWhatsapp?: boolean;
      };

      const filter = await filterService.createFilter(
        request.user!.id,
        request.user!.subscriptionPlan,
        body,
      );

      return reply.status(201).send({ filter });
    },
  );

  app.put(
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
        body: {
          type: "object",
          additionalProperties: false,
          minProperties: 1,
          properties: {
            category: { type: "string", minLength: 1, maxLength: 120 },
            city: { type: "string", maxLength: 500 },
            minPrice: { type: "number", minimum: 0 },
            maxPrice: { type: "number", minimum: 0 },
            keywords: {
              anyOf: [
                { type: "string", maxLength: 500 },
                {
                  type: "array",
                  maxItems: 50,
                  items: { type: "string", minLength: 1, maxLength: 80 },
                },
              ],
            },
            minDealScore: { type: "integer", minimum: 0, maximum: 100 },
            notifyTelegram: { type: "boolean" },
            notifyPush: { type: "boolean" },
            notifyWhatsapp: { type: "boolean" },
            isActive: { type: "boolean" },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as {
        category?: string;
        city?: string;
        minPrice?: number;
        maxPrice?: number;
        keywords?: string | string[];
        minDealScore?: number;
        notifyTelegram?: boolean;
        notifyPush?: boolean;
        notifyWhatsapp?: boolean;
        isActive?: boolean;
      };

      const filter = await filterService.updateFilter(
        id,
        request.user!.id,
        body,
      );

      return reply.status(200).send({ filter });
    },
  );

  app.delete(
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
      const filter = await filterService.deleteFilter(request.user!.id, id);
      return reply.status(200).send({ filter });
    },
  );
};
