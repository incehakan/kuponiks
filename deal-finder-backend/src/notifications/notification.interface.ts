import type { NotificationChannel, SubscriptionPlan } from "@prisma/client";

/**
 * Canonical payload passed to every notification provider.
 * Channel-specific destination fields are optional and validated by each provider.
 */
export interface NotificationPayload {
  userId: string;
  listingId: string;
  title: string;
  message: string;
  price: number;
  dealScore: number;
  url: string;
  channel: NotificationChannel;
  subscriptionPlan?: SubscriptionPlan;
  fcmToken?: string;
  expoPushToken?: string;
  telegramChatId?: string;
  phoneNumber?: string;
}

/**
 * Contract for all notification delivery backends (Telegram, Push, WhatsApp, …).
 * Implementations must never throw to callers — catch internally and return boolean.
 */
export interface INotificationProvider {
  /**
   * Attempts to deliver the notification.
   * @returns `true` when the provider confirms delivery, otherwise `false`.
   */
  send(payload: NotificationPayload): Promise<boolean>;
}
