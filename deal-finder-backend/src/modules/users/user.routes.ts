import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { userService } from "./user.service.js";

/**
 * Authenticated user profile routes.
 */
export const userRoutes: FastifyPluginAsync = async (
  app: FastifyInstance,
) => {
  app.get(
    "/me",
    {
      preHandler: [authenticate],
    },
    async (request, reply) => {
      const user = await userService.getMe(request.user!.id);
      return reply.status(200).send(user);
    },
  );

  /**
   * Registers / updates the Expo Push Token for the signed-in user.
   * Accepts either `pushToken` or `expoPushToken` in the body.
   */
  app.post(
    "/push-token",
    {
      preHandler: [authenticate],
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          anyOf: [
            { required: ["pushToken"] },
            { required: ["expoPushToken"] },
          ],
          properties: {
            pushToken: { type: "string", minLength: 1, maxLength: 512 },
            expoPushToken: { type: "string", minLength: 1, maxLength: 512 },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as {
        pushToken?: string;
        expoPushToken?: string;
      };
      const token = (body.pushToken ?? body.expoPushToken ?? "").trim();
      const user = await userService.saveExpoPushToken(request.user!.id, token);
      return reply.status(200).send({
        success: true,
        message: "Push token kaydedildi",
        user,
      });
    },
  );
};
