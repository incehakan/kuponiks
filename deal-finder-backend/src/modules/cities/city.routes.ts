import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { CITIES, CITIES_WITH_ALL } from "../../data/cities.js";

/**
 * Public city catalog routes.
 */
export const cityRoutes: FastifyPluginAsync = async (
  app: FastifyInstance,
) => {
  app.get("/", async (request, reply) => {
    const query = request.query as { includeAll?: string };
    const includeAll =
      query.includeAll === "1" ||
      query.includeAll === "true" ||
      query.includeAll === "yes";

    return reply.status(200).send({
      cities: includeAll ? CITIES_WITH_ALL : CITIES,
      count: includeAll ? CITIES_WITH_ALL.length : CITIES.length,
    });
  });
};
