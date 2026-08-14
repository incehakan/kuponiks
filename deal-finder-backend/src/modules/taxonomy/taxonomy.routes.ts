import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { taxonomyService } from "./taxonomy.service.js";

/**
 * Public vehicle taxonomy (catalog primary, listing fallback).
 * Mirrors /api/categories and /api/cities (no auth).
 */
export const taxonomyRoutes: FastifyPluginAsync = async (
  app: FastifyInstance,
) => {
  app.get("/vehicle/brands", async (request, reply) => {
    const query = request.query as { q?: string; limit?: string };
    const items = await taxonomyService.listVehicleBrands({
      q: query.q ?? null,
      limit: query.limit,
    });
    return reply.status(200).send({ items });
  });

  app.get("/vehicle/series", async (request, reply) => {
    const query = request.query as {
      brand?: string;
      q?: string;
      limit?: string;
    };
    const brand = (query.brand ?? "").trim();
    if (!brand) {
      return reply.status(400).send({
        statusCode: 400,
        error: "ValidationError",
        message: "brand query parametresi zorunludur",
      });
    }

    const items = await taxonomyService.listVehicleSeries({
      brand,
      q: query.q ?? null,
      limit: query.limit,
    });
    return reply.status(200).send({ items });
  });

  app.get("/vehicle/trims", async (request, reply) => {
    const query = request.query as {
      brand?: string;
      series?: string;
      q?: string;
      limit?: string;
    };
    const brand = (query.brand ?? "").trim();
    const series = (query.series ?? "").trim();
    if (!brand || !series) {
      return reply.status(400).send({
        statusCode: 400,
        error: "ValidationError",
        message: "brand ve series query parametreleri zorunludur",
      });
    }

    const items = await taxonomyService.listVehicleTrims({
      brand,
      series,
      q: query.q ?? null,
      limit: query.limit,
    });
    return reply.status(200).send({ items });
  });

  app.get("/vehicle/fuel-types", async (request, reply) => {
    const query = request.query as { q?: string; limit?: string };
    const items = await taxonomyService.listVehicleFuelTypes({
      q: query.q ?? null,
      limit: query.limit,
    });
    return reply.status(200).send({ items });
  });

  app.get("/vehicle/transmissions", async (request, reply) => {
    const query = request.query as { q?: string; limit?: string };
    const items = await taxonomyService.listVehicleTransmissions({
      q: query.q ?? null,
      limit: query.limit,
    });
    return reply.status(200).send({ items });
  });

  app.get("/vehicle/seller-types", async (request, reply) => {
    const query = request.query as { q?: string; limit?: string };
    const items = await taxonomyService.listVehicleSellerTypes({
      q: query.q ?? null,
      limit: query.limit,
    });
    return reply.status(200).send({ items });
  });

  app.get("/districts", async (request, reply) => {
    const query = request.query as {
      city?: string;
      q?: string;
      limit?: string;
    };
    const items = await taxonomyService.listDistricts({
      city: query.city ?? null,
      q: query.q ?? null,
      limit: query.limit,
    });
    return reply.status(200).send({ items });
  });
};
