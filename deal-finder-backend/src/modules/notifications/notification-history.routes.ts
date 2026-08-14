import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { notificationHistoryService } from "./notification-history.service.js";

export const notificationHistoryRoutes: FastifyPluginAsync = async (
  app: FastifyInstance,
) => {
  app.get(
    "/",
    {
      preHandler: [authenticate],
    },
    async (request, reply) => {
      const query = request.query as { limit?: string };
      const limit = query.limit ? Number(query.limit) : 50;
      const notifications = await notificationHistoryService.listForUser(
        request.user!.id,
        Number.isFinite(limit) ? limit : 50,
      );
      return reply.status(200).send({ notifications });
    },
  );
};
