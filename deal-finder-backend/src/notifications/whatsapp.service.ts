import axios from "axios";
import { env } from "../config/env.js";

export interface SendWhatsAppMessageInput {
  phoneNumber: string;
  text: string;
}

/**
 * Normalizes phone numbers to international WhatsApp/Evolution API format (digits only, no +).
 * Defaults to Turkey (+90) when local numbers start with 0 or are 10-digit mobile numbers.
 */
export function formatPhoneNumberForWhatsApp(
  phone: string,
  defaultCountryCode = "90",
): string {
  let digits = phone.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  if (digits.startsWith("0")) {
    digits = `${defaultCountryCode}${digits.slice(1)}`;
  } else if (
    digits.length === 10 &&
    !digits.startsWith(defaultCountryCode)
  ) {
    digits = `${defaultCountryCode}${digits}`;
  }

  return digits;
}

/**
 * Sends a WhatsApp text message via WHATSAPP_API_URL / WHATSAPP_API_KEY
 * (Evolution API / Baileys compatible gateways).
 */
export async function sendWhatsAppMessage(
  input: SendWhatsAppMessageInput,
): Promise<boolean> {
  try {
    const phoneNumber = input.phoneNumber?.trim();
    if (!phoneNumber) {
      console.error("sendWhatsAppMessage: phoneNumber is required");
      return false;
    }

    if (!env.WHATSAPP_API_URL || !env.WHATSAPP_API_KEY) {
      console.error(
        "sendWhatsAppMessage: WHATSAPP_API_URL or WHATSAPP_API_KEY is not configured",
      );
      return false;
    }

    const formattedNumber = formatPhoneNumberForWhatsApp(phoneNumber);
    if (!formattedNumber) {
      console.error("sendWhatsAppMessage: phoneNumber is invalid after formatting");
      return false;
    }

    const response = await axios.post(
      env.WHATSAPP_API_URL,
      {
        number: formattedNumber,
        text: input.text,
      },
      {
        headers: {
          "Content-Type": "application/json",
          apikey: env.WHATSAPP_API_KEY,
        },
        timeout: 15_000,
        validateStatus: (status) => status >= 200 && status < 300,
      },
    );

    if (response.status < 200 || response.status >= 300) {
      console.error(
        `sendWhatsAppMessage: unexpected status ${response.status} for ${phoneNumber}`,
      );
      return false;
    }

    return true;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown WhatsApp API error";
    console.error(
      `sendWhatsAppMessage failed for ${input.phoneNumber}: ${message}`,
    );
    return false;
  }
}
