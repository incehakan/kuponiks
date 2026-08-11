import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { subscriptionService } from "./subscription.service.js";

/**
 * Authenticated subscription management routes.
 */
export const subscriptionRoutes: FastifyPluginAsync = async (
  app: FastifyInstance,
) => {
  app.post(
    "/upgrade",
    {
      preHandler: [authenticate],
      schema: {
        body: {
          type: "object",
          required: ["plan"],
          additionalProperties: false,
          properties: {
            plan: {
              type: "string",
              enum: ["PRO", "VIP"],
            },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as { plan: "PRO" | "VIP" };

      const result = await subscriptionService.upgradeSubscription(
        request.user!.id,
        body.plan,
      );

      return reply.status(200).send(result);
    },
  );
};
