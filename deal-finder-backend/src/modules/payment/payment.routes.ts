import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { HttpError } from "../../lib/http-error.js";
import type { PaymentProviderName } from "./payment.interface.js";
import { paymentService } from "./payment.service.js";

export const paymentRoutes: FastifyPluginAsync = async (
  app: FastifyInstance,
) => {
  /**
   * POST /api/payment/checkout
   * Creates a checkout session for the authenticated user.
   */
  app.post(
    "/checkout",
    {
      preHandler: [authenticate],
      schema: {
        body: {
          type: "object",
          required: ["plan"],
          properties: {
            plan: { type: "string", enum: ["PRO", "VIP"] },
            callbackUrl: { type: "string", maxLength: 512 },
          },
        },
      },
    },
    async (request, reply) => {
      const { plan, callbackUrl } = request.body as {
        plan: "PRO" | "VIP";
        callbackUrl?: string;
      };

      const user = request.user!;

      const result = await paymentService.createCheckoutSession({
        userId: user.id,
        plan,
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        ...(callbackUrl ? { callbackUrl } : {}),
      });

      return reply.status(200).send(result);
    },
  );

  /**
   * POST /api/payment/webhook/:provider
   * Provider-specific webhook receiver (Iyzico IPN, PayTR callback, RevenueCat events, etc.)
   */
  app.post(
    "/webhook/:provider",
    async (request, reply) => {
      const { provider } = request.params as { provider: string };

      const validProviders: PaymentProviderName[] = [
        "iyzico",
        "paytr",
        "garanti",
        "revenuecat",
      ];

      if (!validProviders.includes(provider as PaymentProviderName)) {
        throw new HttpError(
          `Bilinmeyen ödeme sağlayıcısı: ${provider}`,
          400,
          "ValidationError",
        );
      }

      const paymentProvider = paymentService.getProvider(
        provider as PaymentProviderName,
      );

      const result = await paymentProvider.handleWebhook(request, reply);

      if (result.acknowledged && result.userId && result.plan) {
        await paymentService.verifyAndUpgrade(result);
      }

      return reply.status(200).send({ ok: result.acknowledged });
    },
  );

  /**
   * GET /api/payment/providers
   * Returns available payment provider info for the mobile client.
   */
  app.get("/providers", async (_request, reply) => {
    const active = paymentService.getActiveProvider();
    return reply.status(200).send({
      activeProvider: active.name,
      supportedProviders: ["iyzico", "paytr", "garanti", "revenuecat"],
    });
  });
};
