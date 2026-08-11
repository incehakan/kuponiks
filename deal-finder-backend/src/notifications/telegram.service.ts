import axios from "axios";
import { env } from "../config/env.js";

export interface SendTelegramMessageOptions {
  parseMode?: "Markdown" | "HTML" | "MarkdownV2";
  disableWebPagePreview?: boolean;
}

/**
 * Sends a message via the Telegram Bot API using TELEGRAM_BOT_TOKEN.
 */
export async function sendTelegramMessage(
  chatId: string,
  text: string,
  options: SendTelegramMessageOptions = {},
): Promise<boolean> {
  try {
    const token = env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) {
      console.error("sendTelegramMessage: TELEGRAM_BOT_TOKEN is not configured");
      return false;
    }

    if (!chatId?.trim()) {
      console.error("sendTelegramMessage: chatId is required");
      return false;
    }

    const response = await axios.post(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        chat_id: chatId,
        text,
        ...(options.parseMode !== undefined
          ? { parse_mode: options.parseMode }
          : {}),
        link_preview_options: {
          is_disabled: options.disableWebPagePreview ?? false,
        },
      },
      {
        timeout: 15_000,
        validateStatus: (status) => status >= 200 && status < 300,
      },
    );

    return response.status >= 200 && response.status < 300;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Telegram API error";
    console.error(`sendTelegramMessage failed for chat ${chatId}: ${message}`);
    return false;
  }
}
