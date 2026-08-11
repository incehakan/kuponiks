import { readFileSync } from "node:fs";
import {
  cert,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { Expo, type ExpoPushMessage } from "expo-server-sdk";
import { env } from "../../config/env.js";
import { PermanentNotificationError } from "../permanent-error.js";
import type {
  INotificationProvider,
  NotificationPayload,
} from "../notification.interface.js";

const expo = new Expo(
  env.EXPO_ACCESS_TOKEN ? { accessToken: env.EXPO_ACCESS_TOKEN } : undefined,
);

/**
 * Lazily initializes (or reuses) the Firebase Admin app from a service-account JSON file.
 */
function getFirebaseApp(): App {
  const existing = getApps()[0];
  if (existing) {
    return existing;
  }

  const credentialsRaw = readFileSync(env.FIREBASE_CREDENTIALS_PATH, "utf8");
  const serviceAccount = JSON.parse(credentialsRaw) as ServiceAccount;

  return initializeApp({
    credential: cert(serviceAccount),
  });
}

/**
 * Mobile push notification provider using Expo / Firebase Cloud Messaging.
 */
export class PushProvider implements INotificationProvider {
  async send(payload: NotificationPayload): Promise<boolean> {
    if (payload.expoPushToken) {
      return this.sendExpoPush(payload);
    }

    return this.sendFcmPush(payload);
  }

  private async sendExpoPush(payload: NotificationPayload): Promise<boolean> {
    const token = payload.expoPushToken?.trim();
    if (!token) {
      throw new PermanentNotificationError(
        "no_token",
        `PushProvider: missing Expo token for user ${payload.userId}`,
      );
    }

    if (!Expo.isExpoPushToken(token)) {
      throw new PermanentNotificationError(
        "invalid_token",
        `PushProvider: invalid Expo push token for user ${payload.userId}`,
      );
    }

    try {
      const message: ExpoPushMessage = {
        to: token,
        sound: "default",
        title: payload.title,
        body: payload.message,
        data: {
          listingId: payload.listingId,
          dealId: payload.listingId,
          url: payload.url,
          dealScore: String(payload.dealScore),
          price: String(payload.price),
          platform: "kuponiks",
        },
        priority: "high",
      };

      const tickets = await expo.sendPushNotificationsAsync([message]);
      const ticket = tickets[0];

      if (!ticket || ticket.status === "error") {
        const errCode =
          ticket && "details" in ticket
            ? String(
                (ticket.details as { error?: string } | undefined)?.error ?? "",
              )
            : "";
        const errMessage =
          ticket && "message" in ticket ? String(ticket.message) : "unknown";

        if (
          errCode === "DeviceNotRegistered" ||
          errCode === "InvalidCredentials" ||
          /not.+registered|invalid.+token/i.test(errMessage)
        ) {
          throw new PermanentNotificationError(
            "invalid_token",
            `PushProvider: permanent Expo error for user ${payload.userId}`,
          );
        }

        console.error(
          `PushProvider: Expo push failed for user ${payload.userId}: ${errMessage}`,
        );
        return false;
      }

      console.log(`[NOTIFY] channel=push status=SENT user=${payload.userId}`);
      return true;
    } catch (error) {
      if (error instanceof PermanentNotificationError) {
        throw error;
      }
      const message =
        error instanceof Error ? error.message : "Unknown Expo push error";
      console.error(
        `PushProvider Expo failed for user ${payload.userId}: ${message}`,
      );
      return false;
    }
  }

  private async sendFcmPush(payload: NotificationPayload): Promise<boolean> {
    try {
      if (!payload.fcmToken) {
        throw new PermanentNotificationError(
          "no_token",
          `PushProvider: missing fcmToken for user ${payload.userId}`,
        );
      }

      if (!env.FIREBASE_CREDENTIALS_PATH) {
        console.error(
          "PushProvider: FIREBASE_CREDENTIALS_PATH is not configured",
        );
        return false;
      }

      const messaging = getMessaging(getFirebaseApp());

      await messaging.send({
        token: payload.fcmToken,
        notification: {
          title: payload.title,
          body: payload.message,
        },
        data: {
          listingId: payload.listingId,
          dealId: payload.listingId,
          url: payload.url,
          dealScore: String(payload.dealScore),
          price: String(payload.price),
          channel: payload.channel,
        },
        android: {
          priority: "high",
        },
        apns: {
          headers: {
            "apns-priority": "10",
          },
        },
      });

      console.log(`[NOTIFY] channel=push status=SENT user=${payload.userId}`);
      return true;
    } catch (error) {
      if (error instanceof PermanentNotificationError) {
        throw error;
      }
      const message =
        error instanceof Error ? error.message : "Unknown FCM error";
      console.error(
        `PushProvider failed for user ${payload.userId}: ${message}`,
      );
      return false;
    }
  }
}
