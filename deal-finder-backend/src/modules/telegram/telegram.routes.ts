import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { env } from "../../config/env.js";
import { telegramLinkService } from "./telegram-link.service.js";
import type { TelegramUpdate } from "./telegram.types.js";

/**
 * Telegram Bot webhook + public config for mobile deep links.
 */
export const telegramRoutes: FastifyPluginAsync = async (
  app: FastifyInstance,
) => {
  /**
   * Returns the public bot username for `t.me/<username>?start=<userId>` links.
   */
  app.get("/config", async (_request, reply) => {
    const botUsername = env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "") ?? null;

    return reply.status(200).send({
      botUsername,
      deepLinkBase: botUsername ? `https://t.me/${botUsername}` : null,
    });
  });

  /**
   * Telegram Bot API webhook receiver.
   * Configure via: POST https://api.telegram.org/bot<token>/setWebhook?url=<public-url>/api/telegram/webhook
   */
  app.post("/webhook", async (request, reply) => {
    const update = request.body as TelegramUpdate;

    try {
      const message = update.message;
      if (message?.chat?.id != null && message.text) {
        await telegramLinkService.handleUpdate(
          message.text,
          message.chat.id,
        );
      }
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "Unknown telegram webhook error";
      app.log.error({ err: error }, `Telegram webhook failed: ${reason}`);
    }

    // Telegram expects 200 quickly even when we ignore unknown updates.
    return reply.status(200).send({ ok: true });
  });
};
