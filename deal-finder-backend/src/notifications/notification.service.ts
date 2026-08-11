import {
  NotificationChannel,
  NotificationStatus,
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import type {
  INotificationProvider,
  NotificationPayload,
} from "./notification.interface.js";
import {
  isPermanentNotificationError,
} from "./permanent-error.js";
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
  skipped: number;
  results: Array<{
    channel: NotificationChannel;
    success: boolean;
    skipped?: boolean;
    reason?: string;
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
      return { sent: 0, failed: 0, skipped: 0, results: [] };
    }

    const settled = await Promise.allSettled(
      uniqueChannels.map(async (channel) => this.dispatchOne(input, channel)),
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
          NotificationStatus.FAILED,
          "dispatch_rejected",
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

    const sent = results.filter((r) => r.success && !r.skipped).length;
    const skipped = results.filter((r) => r.skipped).length;
    const failed = results.length - sent - skipped;

    // Only retry when there is a transient failure and nothing was sent/skipped-only.
    if (failed > 0 && sent === 0) {
      throw new Error(
        `All notification channels failed for user ${input.userId} / listing ${input.listingId}`,
      );
    }

    return { sent, failed, skipped, results };
  }

  private async dispatchOne(
    input: NotificationDispatchInput,
    channel: NotificationChannel,
  ): Promise<NotificationDispatchResult["results"][number]> {
    // Permanent channel dedup (SENT)
    const alreadySent = await prisma.notificationLog.findFirst({
      where: {
        userId: input.userId,
        listingId: input.listingId,
        channel,
        status: NotificationStatus.SENT,
      },
      select: { id: true },
    });
    if (alreadySent) {
      await this.persistLog(
        input.userId,
        input.listingId,
        channel,
        NotificationStatus.SKIPPED,
        "already_sent",
      );
      return { channel, success: true, skipped: true, reason: "already_sent" };
    }

    if (channel === NotificationChannel.PUSH) {
      const hasToken = Boolean(
        input.expoPushToken?.trim() || input.fcmToken?.trim(),
      );
      if (!hasToken) {
        await this.persistLog(
          input.userId,
          input.listingId,
          channel,
          NotificationStatus.SKIPPED,
          "no_token",
        );
        console.log(
          `[NOTIFY] channel=push status=SKIPPED reason=no_token user=${input.userId}`,
        );
        return { channel, success: true, skipped: true, reason: "no_token" };
      }
    }

    if (channel === NotificationChannel.TELEGRAM && !input.telegramChatId?.trim()) {
      await this.persistLog(
        input.userId,
        input.listingId,
        channel,
        NotificationStatus.SKIPPED,
        "no_token",
      );
      return { channel, success: true, skipped: true, reason: "no_token" };
    }

    try {
      const success = await this.sendToChannel(input, channel);
      await this.persistLog(
        input.userId,
        input.listingId,
        channel,
        success ? NotificationStatus.SENT : NotificationStatus.FAILED,
        success ? null : "provider_false",
      );
      console.log(
        `[NOTIFY] channel=${channel.toLowerCase()} status=${success ? "SENT" : "FAILED"} user=${input.userId}`,
      );
      return { channel, success };
    } catch (error) {
      if (isPermanentNotificationError(error)) {
        await this.persistLog(
          input.userId,
          input.listingId,
          channel,
          NotificationStatus.SKIPPED,
          error.reason,
        );
        console.log(
          `[NOTIFY] channel=${channel.toLowerCase()} status=SKIPPED reason=${error.reason} user=${input.userId}`,
        );
        return {
          channel,
          success: true,
          skipped: true,
          reason: error.reason,
        };
      }
      throw error;
    }
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
    status: NotificationStatus,
    reason: string | null,
  ): Promise<void> {
    try {
      await prisma.notificationLog.create({
        data: {
          userId,
          listingId,
          channel,
          status,
          ...(reason ? { reason } : {}),
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
