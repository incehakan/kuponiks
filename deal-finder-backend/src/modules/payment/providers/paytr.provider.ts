import type { FastifyReply, FastifyRequest } from "fastify";
import type {
  CheckoutSessionInput,
  CheckoutSessionResult,
  PaymentProvider,
  VerifyPaymentInput,
  VerifyPaymentResult,
  WebhookHandlerResult,
} from "../payment.interface.js";

/**
 * PayTR Virtual POS provider stub.
 *
 * Required env vars (when active):
 *   PAYTR_MERCHANT_ID, PAYTR_MERCHANT_KEY, PAYTR_MERCHANT_SALT
 */
export class PaytrProvider implements PaymentProvider {
  readonly name = "paytr" as const;

  async createCheckoutSession(
    input: CheckoutSessionInput,
  ): Promise<CheckoutSessionResult> {
    // TODO: POST https://www.paytr.com/odeme/api/get-token
    // Build HMAC hash with merchant_key + merchant_salt + params
    // Return iframeToken → paymentUrl = https://www.paytr.com/odeme/guvenli/{token}
    console.warn("PaytrProvider.createCheckoutSession: not yet implemented");
    return {
      paymentUrl: `https://www.paytr.com/odeme/guvenli/stub_${input.userId}`,
      sessionToken: `paytr_stub_${Date.now()}`,
      provider: this.name,
    };
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    // TODO: PayTR callback hash verification
    console.warn("PaytrProvider.verifyPayment: not yet implemented");
    return { success: false, errorMessage: "PayTR verification not implemented" };
  }

  async handleWebhook(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<WebhookHandlerResult> {
    // TODO: PayTR sends POST callback with merchant_oid, status, total_amount, hash
    // Verify HMAC, parse merchant_oid for userId+plan, return result
    const body = request.body as Record<string, unknown>;
    console.warn("PaytrProvider.handleWebhook: not yet implemented", body);
    return { acknowledged: true };
  }
}
