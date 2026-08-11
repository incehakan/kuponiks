import type { SubscriptionPlan } from "@prisma/client";
import type { FastifyRequest, FastifyReply } from "fastify";

export type PaymentProviderName =
  | "iyzico"
  | "paytr"
  | "garanti"
  | "revenuecat";

export interface CheckoutSessionInput {
  userId: string;
  plan: Exclude<SubscriptionPlan, "FREE">;
  email?: string;
  phoneNumber?: string;
  fullName?: string;
  /** Mobile return URL after 3D Secure redirect. */
  callbackUrl?: string;
}

export interface CheckoutSessionResult {
  /** If set, redirect user to this URL (WebView or browser). */
  paymentUrl?: string;
  /** If set, render this HTML form in a WebView. */
  paymentHtml?: string;
  /** Opaque provider session / token for reconciliation. */
  sessionToken: string;
  provider: PaymentProviderName;
}

export interface VerifyPaymentInput {
  sessionToken: string;
  providerPayload?: Record<string, unknown>;
}

export interface VerifyPaymentResult {
  success: boolean;
  userId?: string;
  plan?: Exclude<SubscriptionPlan, "FREE">;
  providerTransactionId?: string;
  errorMessage?: string;
}

export interface WebhookHandlerResult {
  acknowledged: boolean;
  userId?: string;
  plan?: Exclude<SubscriptionPlan, "FREE">;
  providerTransactionId?: string;
}

/**
 * Common interface for all payment provider implementations.
 */
export interface PaymentProvider {
  readonly name: PaymentProviderName;

  createCheckoutSession(
    input: CheckoutSessionInput,
  ): Promise<CheckoutSessionResult>;

  verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult>;

  handleWebhook(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<WebhookHandlerResult>;
}
