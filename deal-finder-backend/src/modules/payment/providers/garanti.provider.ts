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
 * Garanti BBVA Virtual POS (GVP XML/Form) provider stub.
 *
 * Required env vars (when active):
 *   GARANTI_TERMINAL_ID, GARANTI_MERCHANT_ID, GARANTI_PROVISION_PASSWORD,
 *   GARANTI_STORE_KEY, GARANTI_BASE_URL
 */
export class GarantiProvider implements PaymentProvider {
  readonly name = "garanti" as const;

  async createCheckoutSession(
    input: CheckoutSessionInput,
  ): Promise<CheckoutSessionResult> {
    // TODO: Build GVP 3D Pay XML request
    // Generate SHA512 hash, create HTML auto-submit form for 3D Secure redirect
    console.warn("GarantiProvider.createCheckoutSession: not yet implemented");
    const formHtml = `
      <html><body>
        <form id="gvp3d" method="POST" action="https://sanalposprov.garanti.com.tr/servlet/gt3dengine">
          <!-- GVP fields for 3D Secure initiation -->
          <input type="hidden" name="mode" value="TEST" />
          <input type="hidden" name="orderid" value="stub_${Date.now()}" />
        </form>
        <script>document.getElementById('gvp3d').submit();</script>
      </body></html>
    `.trim();

    return {
      paymentHtml: formHtml,
      sessionToken: `garanti_stub_${Date.now()}`,
      provider: this.name,
    };
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    // TODO: Verify GVP 3D callback hash + provision XML request
    console.warn("GarantiProvider.verifyPayment: not yet implemented");
    return { success: false, errorMessage: "Garanti verification not implemented" };
  }

  async handleWebhook(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<WebhookHandlerResult> {
    // Garanti typically uses return POST (not async webhook), handled by verifyPayment.
    const body = request.body as Record<string, unknown>;
    console.warn("GarantiProvider.handleWebhook: callback received", body);
    return { acknowledged: true };
  }
}
