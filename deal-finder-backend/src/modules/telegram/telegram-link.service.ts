import { prisma } from "../../lib/prisma.js";
import { sendTelegramMessage } from "../../notifications/telegram.service.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const LINK_SUCCESS_MESSAGE =
  "Kuponiks hesabınız başarıyla eşleşti! Artık kelepir ilan bildirimlerini buradan alacaksınız.";

/**
 * Parses `/start <USER_ID>` deep-link payloads from Telegram messages.
 */
export function parseStartCommand(text: string | undefined): string | null {
  if (!text?.trim()) {
    return null;
  }

  const match = text.trim().match(/^\/start(?:@[\w_]+)?(?:\s+(.+))?$/i);
  const payload = match?.[1]?.trim();

  if (!payload || !UUID_RE.test(payload)) {
    return null;
  }

  return payload;
}

/**
 * Links a Kuponiks user account to a Telegram chat id.
 */
export class TelegramLinkService {
  async linkUserTelegramAccount(
    userId: string,
    telegramChatId: string,
  ): Promise<{ linked: boolean; message: string }> {
    const chatId = telegramChatId.trim();
    if (!chatId) {
      return { linked: false, message: "Geçersiz Telegram chat id" };
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return { linked: false, message: "Kullanıcı bulunamadı" };
    }

    // Ensure one Telegram chat maps to a single app account.
    await prisma.user.updateMany({
      where: {
        telegramChatId: chatId,
        NOT: { id: userId },
      },
      data: { telegramChatId: null },
    });

    await prisma.user.update({
      where: { id: userId },
      data: { telegramChatId: chatId },
    });

    const sent = await sendTelegramMessage(chatId, LINK_SUCCESS_MESSAGE);

    if (!sent) {
      console.warn(
        `TelegramLinkService: linked user ${userId} but confirmation message failed`,
      );
    }

    return { linked: true, message: LINK_SUCCESS_MESSAGE };
  }

  /**
   * Handles an incoming Telegram webhook update ( `/start <userId>` ).
   */
  async handleUpdate(messageText: string | undefined, chatId: number): Promise<void> {
    const userId = parseStartCommand(messageText);
    if (!userId) {
      return;
    }

    await this.linkUserTelegramAccount(userId, String(chatId));
  }
}

export const telegramLinkService = new TelegramLinkService();
