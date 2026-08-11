import { sendWhatsAppMessage } from "../whatsapp.service.js";
import type {
  INotificationProvider,
  NotificationPayload,
} from "../notification.interface.js";

/**
 * Builds a plain-text WhatsApp body for Evolution API / Baileys compatible gateways.
 */
function buildWhatsAppText(payload: NotificationPayload): string {
  const price = payload.price.toLocaleString("tr-TR", {
    style: "currency",
    currency: "TRY",
  });

  return [
    `🔥 Kuponiks Fırsat Alarmı`,
    ``,
    payload.title,
    payload.message,
    ``,
    `💰 Fiyat: ${price}`,
    `📊 Deal Score: ${payload.dealScore}`,
    ``,
    `🔗 ${payload.url}`,
  ].join("\n");
}

/**
 * WhatsApp notification provider via an external HTTP API
 * (Evolution API / Baileys compatible).
 */
export class WhatsAppProvider implements INotificationProvider {
  async send(payload: NotificationPayload): Promise<boolean> {
    try {
      if (!payload.phoneNumber) {
        console.error(
          `WhatsAppProvider: missing phoneNumber for user ${payload.userId}`,
        );
        return false;
      }

      return sendWhatsAppMessage({
        phoneNumber: payload.phoneNumber,
        text: buildWhatsAppText(payload),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown WhatsApp API error";
      console.error(
        `WhatsAppProvider failed for user ${payload.userId}: ${message}`,
      );
      return false;
    }
  }
}
