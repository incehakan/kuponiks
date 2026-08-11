import { SubscriptionPlan } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../lib/http-error.js";
import type {
  CheckoutSessionInput,
  CheckoutSessionResult,
  PaymentProvider,
  PaymentProviderName,
  VerifyPaymentResult,
  WebhookHandlerResult,
} from "./payment.interface.js";
import { IyzicoProvider } from "./providers/iyzico.provider.js";
import { PaytrProvider } from "./providers/paytr.provider.js";
import { GarantiProvider } from "./providers/garanti.provider.js";
import { RevenueCatProvider } from "./providers/revenuecat.provider.js";

const PROVIDERS: Record<PaymentProviderName, () => PaymentProvider> = {
  iyzico: () => new IyzicoProvider(),
  paytr: () => new PaytrProvider(),
  garanti: () => new GarantiProvider(),
  revenuecat: () => new RevenueCatProvider(),
};

function resolveActiveProvider(): PaymentProviderName {
  const raw = process.env.ACTIVE_PAYMENT_PROVIDER?.trim().toLowerCase();
  if (raw && raw in PROVIDERS) {
    return raw as PaymentProviderName;
  }
  return "iyzico";
}

/**
 * Payment service using Strategy/Factory pattern.
 * Selects active provider from ACTIVE_PAYMENT_PROVIDER env var.
 */
export class PaymentService {
  private readonly defaultProvider: PaymentProvider;
  private readonly providerInstances = new Map<
    PaymentProviderName,
    PaymentProvider
  >();

  constructor() {
    const activeName = resolveActiveProvider();
    this.defaultProvider = this.getProvider(activeName);
    console.log(`PaymentService: active provider = ${activeName}`);
  }

  getProvider(name: PaymentProviderName): PaymentProvider {
    let instance = this.providerInstances.get(name);
    if (!instance) {
      const factory = PROVIDERS[name];
      if (!factory) {
        throw new HttpError(
          `Bilinmeyen ödeme sağlayıcısı: ${name}`,
          400,
          "ValidationError",
        );
      }
      instance = factory();
      this.providerInstances.set(name, instance);
    }
    return instance;
  }

  getActiveProvider(): PaymentProvider {
    return this.defaultProvider;
  }

  async createCheckoutSession(
    input: CheckoutSessionInput,
  ): Promise<CheckoutSessionResult> {
    return this.defaultProvider.createCheckoutSession(input);
  }

  async verifyAndUpgrade(
    result: WebhookHandlerResult | VerifyPaymentResult,
  ): Promise<void> {
    const userId =
      "userId" in result ? result.userId : undefined;
    const plan =
      "plan" in result ? result.plan : undefined;

    if (!userId || !plan) {
      return;
    }

    const validPlans: SubscriptionPlan[] = [
      SubscriptionPlan.PRO,
      SubscriptionPlan.VIP,
    ];
    if (!validPlans.includes(plan as SubscriptionPlan)) {
      return;
    }

    await prisma.user.update({
      where: { id: userId },
      data: { subscriptionPlan: plan as SubscriptionPlan },
    });

    console.log(
      `PaymentService: upgraded user ${userId} to ${plan}`,
    );
  }
}

export const paymentService = new PaymentService();
