import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import {
  authenticate,
  optionalAuthenticate,
} from "../../middlewares/auth.middleware.js";
import { filterService } from "./filter.service.js";
import { normalizeEmptyNumericFilterFields } from "./optional-numeric.js";

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

const nullableString = (maxLength: number) =>
  ({
    // null must be representable; prefer type-union over anyOf+[coerceTypes]
    // (anyOf with integer-first coerces JSON null → 0).
    type: ["string", "null"],
    maxLength,
  }) as const;

/**
 * Nullable numerics MUST use type: [number|integer, "null"], NOT
 * anyOf:[{type:integer},{type:null}].
 *
 * Fastify/Ajv coerceTypes + integer-first anyOf turns explicit JSON `null`
 * into `0` (Number(null)===0). That rewrote empty mobile mileage/price/year
 * clears (maxMileage:null) into maxMileage=0 in production.
 */
const nullableYear = {
  type: ["integer", "null"],
  minimum: 1900,
  maximum: 2100,
} as const;

const nullableNonNegInt = {
  type: ["integer", "null"],
  minimum: 0,
} as const;

const nullableNonNegNumber = {
  type: ["number", "null"],
  minimum: 0,
} as const;

const filterBodyProperties = {
  category: { type: "string", minLength: 1, maxLength: 120 },
  name: nullableString(120),
  subcategory: nullableString(120),
  brand: nullableString(80),
  model: nullableString(80),
  series: nullableString(80),
  trim: nullableString(120),
  variant: nullableString(80),
  minYear: nullableYear,
  maxYear: nullableYear,
  minMileage: nullableNonNegInt,
  maxMileage: nullableNonNegInt,
  city: nullableString(500),
  district: nullableString(120),
  minPrice: nullableNonNegNumber,
  maxPrice: nullableNonNegNumber,
  fuelType: nullableString(40),
  transmission: nullableString(40),
  sellerType: nullableString(40),
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
  app.addHook("preValidation", async (request) => {
    if (
      request.method === "POST" ||
      request.method === "PUT" ||
      request.method === "PATCH"
    ) {
      normalizeEmptyNumericFilterFields(request.body);
    }
  });
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
