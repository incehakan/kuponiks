import { Prisma, SubscriptionPlan, type User } from "@prisma/client";
import { HttpError } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";
import { authService, type PublicUser } from "../auth/auth.service.js";

/** Plans that can be selected via the upgrade endpoint. */
export type UpgradablePlan = typeof SubscriptionPlan.PRO | typeof SubscriptionPlan.VIP;

/**
 * Rank used to prevent accidental downgrades through the upgrade endpoint.
 */
const PLAN_RANK: Record<SubscriptionPlan, number> = {
  [SubscriptionPlan.FREE]: 0,
  [SubscriptionPlan.PRO]: 1,
  [SubscriptionPlan.VIP]: 2,
};

export interface UpgradeSubscriptionResult {
  user: PublicUser;
  accessToken: string;
  tokenType: "Bearer";
  previousPlan: SubscriptionPlan;
}

/**
 * Subscription plan management (upgrade FREE → PRO / VIP).
 */
export class SubscriptionService {
  /**
   * Upgrades the authenticated user's subscription plan and returns a fresh JWT
   * so subsequent requests reflect the new plan limits immediately.
   */
  async upgradeSubscription(
    userId: string,
    plan: UpgradablePlan,
  ): Promise<UpgradeSubscriptionResult> {
    try {
      if (plan !== SubscriptionPlan.PRO && plan !== SubscriptionPlan.VIP) {
        throw new HttpError(
          'Paket "PRO" veya "VIP" olmalıdır',
          400,
          "ValidationError",
        );
      }

      const existing = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!existing) {
        throw new HttpError("Kullanıcı bulunamadı", 404, "NotFoundError");
      }

      if (existing.subscriptionPlan === plan) {
        throw new HttpError(
          `Zaten ${plan} paketindesiniz`,
          409,
          "ConflictError",
        );
      }

      if (PLAN_RANK[plan] < PLAN_RANK[existing.subscriptionPlan]) {
        throw new HttpError(
          `${existing.subscriptionPlan} paketinden ${plan} paketine düşürme bu uç nokta ile yapılamaz`,
          400,
          "ValidationError",
        );
      }

      const updated = await prisma.user.update({
        where: { id: userId },
        data: { subscriptionPlan: plan },
      });

      const accessToken = authService.signAccessToken({
        id: updated.id,
        phoneNumber: updated.phoneNumber,
        fullName: updated.fullName,
        subscriptionPlan: updated.subscriptionPlan,
      });

      return {
        user: this.toPublicUser(updated),
        accessToken,
        tokenType: "Bearer",
        previousPlan: existing.subscriptionPlan,
      };
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        throw new HttpError("Kullanıcı bulunamadı", 404, "NotFoundError");
      }

      const message =
        error instanceof Error
          ? error.message
          : "Bilinmeyen abonelik yükseltme hatası";
      console.error(`SubscriptionService.upgradeSubscription failed: ${message}`);
      throw new HttpError("Abonelik yükseltilemedi", 500);
    }
  }

  private toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      fullName: user.fullName,
      phoneNumber: user.phoneNumber,
      subscriptionPlan: user.subscriptionPlan,
      telegramChatId: user.telegramChatId,
      fcmDeviceToken: user.fcmDeviceToken,
      expoPushToken: user.expoPushToken,
      createdAt: user.createdAt,
    };
  }
}

/** Shared subscription service instance. */
export const subscriptionService = new SubscriptionService();
