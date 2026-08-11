import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { CATEGORY_TREE, flattenCategoryPaths } from "../../data/categories.js";

/**
 * Public category catalog routes.
 */
export const categoryRoutes: FastifyPluginAsync = async (
  app: FastifyInstance,
) => {
  app.get("/", async (_request, reply) => {
    return reply.status(200).send({
      categories: CATEGORY_TREE,
      flat: flattenCategoryPaths(),
    });
  });
};
