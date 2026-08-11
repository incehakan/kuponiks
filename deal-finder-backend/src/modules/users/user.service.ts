import { HttpError } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";
import type { PublicUser } from "../auth/auth.service.js";

/**
 * Authenticated user profile lookups and device token updates.
 */
export class UserService {
  /**
   * Returns public profile fields for the given user id.
   */
  async getMe(userId: string): Promise<PublicUser> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new HttpError("Kullanıcı bulunamadı", 404, "NotFoundError");
      }

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
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }

      const message =
        error instanceof Error ? error.message : "Bilinmeyen profil getirme hatası";
      console.error(`UserService.getMe failed: ${message}`);
      throw new HttpError("Kullanıcı profili alınamadı", 500);
    }
  }

  /**
   * Saves the Expo Push Token for the authenticated user.
   */
  async saveExpoPushToken(
    userId: string,
    expoPushToken: string,
  ): Promise<PublicUser> {
    const token = expoPushToken?.trim();

    if (!token) {
      throw new HttpError("expoPushToken zorunludur", 400);
    }

    try {
      const user = await prisma.user.update({
        where: { id: userId },
        data: { expoPushToken: token },
      });

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
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }

      const message =
        error instanceof Error
          ? error.message
          : "Bilinmeyen push token kaydetme hatası";
      console.error(`UserService.saveExpoPushToken failed: ${message}`);
      throw new HttpError("Push token kaydedilemedi", 500);
    }
  }
}

/** Shared user service instance. */
export const userService = new UserService();
