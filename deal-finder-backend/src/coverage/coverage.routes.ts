import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { authenticate } from "../middlewares/auth.middleware.js";
import { evaluateFilterCoverage } from "./coverage.service.js";

export const coverageRoutes: FastifyPluginAsync = async (
  app: FastifyInstance,
) => {
  app.get(
    "/:id/coverage",
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
      const body = await evaluateFilterCoverage(id, request.user!.id);
      return reply.status(200).send(body);
    },
  );
};
