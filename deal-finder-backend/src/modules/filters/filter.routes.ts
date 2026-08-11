import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import {
  authenticate,
  optionalAuthenticate,
} from "../../middlewares/auth.middleware.js";
import { filterService } from "./filter.service.js";

const keywordSchema = {
  anyOf: [
    { type: "string", maxLength: 500 },
    {
      type: "array",
      maxItems: 50,
      items: { type: "string", minLength: 1, maxLength: 80 },
    },
  ],
} as const;

const filterBodyProperties = {
  category: { type: "string", minLength: 1, maxLength: 120 },
  subcategory: { type: "string", maxLength: 120 },
  brand: { type: "string", maxLength: 80 },
  model: { type: "string", maxLength: 80 },
  variant: { type: "string", maxLength: 80 },
  minYear: { type: "integer", minimum: 0 },
  maxYear: { type: "integer", minimum: 0 },
  minMileage: { type: "integer", minimum: 0 },
  maxMileage: { type: "integer", minimum: 0 },
  city: { type: "string", maxLength: 500 },
  district: { type: "string", maxLength: 120 },
  minPrice: { type: "number", minimum: 0 },
  maxPrice: { type: "number", minimum: 0 },
  fuelType: { type: "string", maxLength: 40 },
  transmission: { type: "string", maxLength: 40 },
  sellerType: { type: "string", maxLength: 40 },
  keywords: keywordSchema,
  excludedKeywords: keywordSchema,
  minDealScore: { type: "integer", minimum: 0, maximum: 100 },
  notifyTelegram: { type: "boolean" },
  notifyPush: { type: "boolean" },
  notifyWhatsapp: { type: "boolean" },
} as const;

/**
 * Filter management routes.
 * GET is public (empty list without auth); mutations require JWT.
 */
export const filterRoutes: FastifyPluginAsync = async (
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
          properties: filterBodyProperties,
        },
      },
    },
    async (request, reply) => {
      const body = request.body as Record<string, unknown>;
      const filter = await filterService.createFilter(
        request.user!.id,
        request.user!.subscriptionPlan,
        body as unknown as Parameters<typeof filterService.createFilter>[2],
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
            ...filterBodyProperties,
            isActive: { type: "boolean" },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as Record<string, unknown>;

      const filter = await filterService.updateFilter(
        id,
        request.user!.id,
        body as unknown as Parameters<typeof filterService.updateFilter>[2],
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
