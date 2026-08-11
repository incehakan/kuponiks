import {
  NotificationChannel,
  NotificationStatus,
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import type {
  INotificationProvider,
  NotificationPayload,
} from "./notification.interface.js";
import { PushProvider } from "./providers/push.provider.js";
import { TelegramProvider } from "./providers/telegram.provider.js";
import { WhatsAppProvider } from "./providers/whatsapp.provider.js";

/**
 * Channel-agnostic fields shared across a multi-channel dispatch.
 */
export type NotificationDispatchInput = Omit<NotificationPayload, "channel">;

/**
 * Result summary for a multi-channel notification attempt.
 */
export interface NotificationDispatchResult {
  sent: number;
  failed: number;
  results: Array<{
    channel: NotificationChannel;
    success: boolean;
  }>;
}

/**
 * Orchestrates notification providers, parallel delivery, and NotificationLog persistence.
 */
export class NotificationService {
  private readonly providers: ReadonlyMap<
    NotificationChannel,
    INotificationProvider
  >;

  constructor(
    providers?: Partial<Record<NotificationChannel, INotificationProvider>>,
  ) {
    this.providers = new Map<NotificationChannel, INotificationProvider>([
      [NotificationChannel.TELEGRAM, providers?.TELEGRAM ?? new TelegramProvider()],
      [NotificationChannel.PUSH, providers?.PUSH ?? new PushProvider()],
      [NotificationChannel.WHATSAPP, providers?.WHATSAPP ?? new WhatsAppProvider()],
    ]);
  }

  /**
   * Dispatches a notification to the requested channels in parallel and
   * persists a NotificationLog row per channel outcome.
   */
  async dispatch(
    input: NotificationDispatchInput,
    channels: NotificationChannel[],
  ): Promise<NotificationDispatchResult> {
    const uniqueChannels = [...new Set(channels)];

    if (uniqueChannels.length === 0) {
      return { sent: 0, failed: 0, results: [] };
    }

    const settled = await Promise.allSettled(
      uniqueChannels.map(async (channel) => {
        const success = await this.sendToChannel(input, channel);
        await this.persistLog(input.userId, input.listingId, channel, success);
        return { channel, success };
      }),
    );

    const results: NotificationDispatchResult["results"] = [];

    for (const [index, outcome] of settled.entries()) {
      const channel = uniqueChannels[index]!;

      if (outcome.status === "fulfilled") {
        results.push(outcome.value);
        continue;
      }

      const reason =
        outcome.reason instanceof Error
          ? outcome.reason.message
          : "Unknown dispatch error";
      console.error(
        `NotificationService: channel ${channel} rejected for user ${input.userId}: ${reason}`,
      );

      try {
        await this.persistLog(
          input.userId,
          input.listingId,
          channel,
          false,
        );
      } catch (logError) {
        const message =
          logError instanceof Error
            ? logError.message
            : "Unknown NotificationLog write error";
        console.error(
          `NotificationService: failed to persist FAILED log for ${channel}: ${message}`,
        );
      }

      results.push({ channel, success: false });
    }

    const sent = results.filter((r) => r.success).length;
    const failed = results.length - sent;

    if (failed === results.length) {
      throw new Error(
        `All notification channels failed for user ${input.userId} / listing ${input.listingId}`,
      );
    }

    return { sent, failed, results };
  }

  /**
   * Routes a single-channel payload to the matching provider.
   */
  private async sendToChannel(
    input: NotificationDispatchInput,
    channel: NotificationChannel,
  ): Promise<boolean> {
    const provider = this.providers.get(channel);

    if (!provider) {
      console.error(`NotificationService: no provider registered for ${channel}`);
      return false;
    }

    const payload: NotificationPayload = {
      ...input,
      channel,
    };

    return provider.send(payload);
  }

  /**
   * Writes a NotificationLog entry for auditing and analytics.
   */
  private async persistLog(
    userId: string,
    listingId: string,
    channel: NotificationChannel,
    success: boolean,
  ): Promise<void> {
    try {
      await prisma.notificationLog.create({
        data: {
          userId,
          listingId,
          channel,
          status: success
            ? NotificationStatus.SENT
            : NotificationStatus.FAILED,
        },
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown NotificationLog persistence error";
      console.error(
        `NotificationService: NotificationLog write failed (${channel}): ${message}`,
      );
      throw error;
    }
  }
}

/** Shared application-wide notification service instance. */
export const notificationService = new NotificationService();
