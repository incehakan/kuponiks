import type { FastifyReply, FastifyRequest } from "fastify";
import type { SubscriptionPlan } from "@prisma/client";
import type {
  CheckoutSessionInput,
  CheckoutSessionResult,
  PaymentProvider,
  VerifyPaymentInput,
  VerifyPaymentResult,
  WebhookHandlerResult,
} from "../payment.interface.js";

/**
 * RevenueCat Apple/Google IAP provider.
 *
 * Required env vars (when active):
 *   REVENUECAT_API_KEY, REVENUECAT_WEBHOOK_AUTH_KEY
 *
 * Mobile handles purchase natively via RevenueCat SDK.
 * Backend only needs to verify webhooks and map entitlement → subscriptionPlan.
 */
export class RevenueCatProvider implements PaymentProvider {
  readonly name = "revenuecat" as const;

  async createCheckoutSession(
    input: CheckoutSessionInput,
  ): Promise<CheckoutSessionResult> {
    // RevenueCat IAP is triggered on-device; no server-side checkout URL needed.
    return {
      sessionToken: `rc_${input.userId}_${input.plan}`,
      provider: this.name,
    };
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    // TODO: Call RevenueCat REST API: GET /v1/subscribers/{app_user_id}
    // Verify entitlements: "pro_monthly" → PRO, "vip_monthly" → VIP
    console.warn("RevenueCatProvider.verifyPayment: not yet implemented");
    return { success: false, errorMessage: "RevenueCat verification not implemented" };
  }

  async handleWebhook(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<WebhookHandlerResult> {
    // TODO: Validate Authorization header against REVENUECAT_WEBHOOK_AUTH_KEY
    // Parse event type: INITIAL_PURCHASE, RENEWAL, CANCELLATION, EXPIRATION
    const body = request.body as Record<string, unknown>;
    const event = (body as { event?: { type?: string; app_user_id?: string; product_id?: string } }).event;

    if (!event) {
      return { acknowledged: false };
    }

    const userId = event.app_user_id ?? undefined;
    const productId = event.product_id ?? "";

    let plan: Exclude<SubscriptionPlan, "FREE"> | undefined;
    if (productId.includes("vip")) {
      plan = "VIP";
    } else if (productId.includes("pro")) {
      plan = "PRO";
    }

    const isPurchaseEvent =
      event.type === "INITIAL_PURCHASE" ||
      event.type === "RENEWAL" ||
      event.type === "NON_RENEWING_PURCHASE";

    if (isPurchaseEvent && userId && plan) {
      return {
        acknowledged: true,
        userId,
        plan,
        providerTransactionId: `rc_${Date.now()}`,
      };
    }

    // Cancellation / expiration: could downgrade to FREE
    return { acknowledged: true };
  }
}
