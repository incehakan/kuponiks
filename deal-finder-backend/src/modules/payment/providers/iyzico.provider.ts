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
 * İyzico (iyzipay) Virtual POS provider stub.
 *
 * Required env vars (when active):
 *   IYZICO_API_KEY, IYZICO_SECRET_KEY, IYZICO_BASE_URL
 */
export class IyzicoProvider implements PaymentProvider {
  readonly name = "iyzico" as const;

  async createCheckoutSession(
    input: CheckoutSessionInput,
  ): Promise<CheckoutSessionResult> {
    // TODO: Implement Iyzipay CheckoutFormInitialize
    // const iyzipay = new Iyzipay({ apiKey, secretKey, uri: baseUrl });
    // const result = await iyzipay.checkoutFormInitialize.create({ ... });
    // return { paymentUrl: result.paymentPageUrl, sessionToken: result.token, provider: this.name };
    console.warn("IyzicoProvider.createCheckoutSession: not yet implemented");
    return {
      paymentUrl: `https://sandbox-api.iyzipay.com/checkout?user=${input.userId}`,
      sessionToken: `iyzico_stub_${Date.now()}`,
      provider: this.name,
    };
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    // TODO: Implement Iyzipay CheckoutForm.retrieve({ token })
    console.warn("IyzicoProvider.verifyPayment: not yet implemented");
    return { success: false, errorMessage: "Iyzico verification not implemented" };
  }

  async handleWebhook(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<WebhookHandlerResult> {
    // TODO: Parse Iyzico IPN / webhook payload
    const body = request.body as Record<string, unknown>;
    console.warn("IyzicoProvider.handleWebhook: not yet implemented", body);
    return { acknowledged: true };
  }
}
