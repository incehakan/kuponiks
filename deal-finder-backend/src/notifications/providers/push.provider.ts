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
 * Mobile push notification provider using Firebase Cloud Messaging.
 */
export class PushProvider implements INotificationProvider {
  async send(payload: NotificationPayload): Promise<boolean> {
    if (payload.expoPushToken) {
      return this.sendExpoPush(payload);
    }

    return this.sendFcmPush(payload);
  }

  private async sendExpoPush(payload: NotificationPayload): Promise<boolean> {
    try {
      const token = payload.expoPushToken?.trim();
      if (!token) {
        return false;
      }

      if (!Expo.isExpoPushToken(token)) {
        console.error(
          `PushProvider: invalid Expo push token for user ${payload.userId}`,
        );
        return false;
      }

      const message: ExpoPushMessage = {
        to: token,
        sound: "default",
        title: payload.title,
        body: payload.message,
        data: {
          userId: payload.userId,
          listingId: payload.listingId,
          url: payload.url,
          dealScore: String(payload.dealScore),
          price: String(payload.price),
        },
        priority: "high",
      };

      const tickets = await expo.sendPushNotificationsAsync([message]);
      const ticket = tickets[0];

      if (!ticket || ticket.status === "error") {
        console.error(
          `PushProvider: Expo push failed for user ${payload.userId}: ${ticket && "message" in ticket ? ticket.message : "unknown"}`,
        );
        return false;
      }

      return true;
    } catch (error) {
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
        console.error(
          `PushProvider: missing fcmToken for user ${payload.userId}`,
        );
        return false;
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
          userId: payload.userId,
          listingId: payload.listingId,
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

      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown FCM error";
      console.error(
        `PushProvider failed for user ${payload.userId}: ${message}`,
      );
      return false;
    }
  }
}
