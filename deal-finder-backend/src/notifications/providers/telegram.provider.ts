import { sendTelegramMessage } from "../telegram.service.js";
import type {
  INotificationProvider,
  NotificationPayload,
} from "../notification.interface.js";

/**
 * Escapes Telegram legacy Markdown special characters in user-controlled text.
 */
function escapeMarkdown(text: string): string {
  return text.replace(/([_*`\[\\])/g, "\\$1");
}

/**
 * Formats a listing deal into a readable Markdown Telegram message.
 */
function buildTelegramMessage(payload: NotificationPayload): string {
  const title = escapeMarkdown(payload.title);
  const message = escapeMarkdown(payload.message);
  const price = payload.price.toLocaleString("tr-TR", {
    style: "currency",
    currency: "TRY",
  });

  return [
    `🔥 *Kuponiks Fırsat Alarmı*`,
    ``,
    `*${title}*`,
    message,
    ``,
    `💰 Fiyat: *${escapeMarkdown(price)}*`,
    `📊 Deal Score: *${payload.dealScore}*`,
    ``,
    `[İlana git](${payload.url})`,
  ].join("\n");
}

/**
 * Telegram notification provider powered by Telegram Bot API.
 */
export class TelegramProvider implements INotificationProvider {
  async send(payload: NotificationPayload): Promise<boolean> {
    try {
      if (!payload.telegramChatId) {
        console.error(
          `TelegramProvider: missing telegramChatId for user ${payload.userId}`,
        );
        return false;
      }

      return sendTelegramMessage(
        payload.telegramChatId,
        buildTelegramMessage(payload),
        { parseMode: "Markdown" },
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown Telegram error";
      console.error(
        `TelegramProvider failed for user ${payload.userId}: ${message}`,
      );
      return false;
    }
  }
}
