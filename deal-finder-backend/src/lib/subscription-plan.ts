import { NotificationChannel, SubscriptionPlan } from "@prisma/client";
import { HttpError } from "./http-error.js";

/** Active filter limits per plan (`null` = unlimited). */
export const FILTER_LIMITS: Record<
  SubscriptionPlan,
  number | null
> = {
  [SubscriptionPlan.FREE]: 1,
  [SubscriptionPlan.PRO]: 10,
  [SubscriptionPlan.VIP]: null,
};

/** FREE plan notification delay (10 minutes). PRO/VIP → immediate. */
export const FREE_PLAN_DELAY_MS = 10 * 60 * 1000;

/**
 * Minimum time between scrapes of the same canonical query, by the
 * most generous plan among grouped active filters.
 * Notification delay (FREE_PLAN_DELAY_MS) is separate.
 */
export const SCRAPE_INTERVAL_MS: Record<SubscriptionPlan, number> = {
  [SubscriptionPlan.VIP]: 5 * 60 * 1000,
  [SubscriptionPlan.PRO]: 10 * 60 * 1000,
  [SubscriptionPlan.FREE]: 15 * 60 * 1000,
};

export function getScrapeIntervalMs(plan: SubscriptionPlan): number {
  return SCRAPE_INTERVAL_MS[plan] ?? SCRAPE_INTERVAL_MS[SubscriptionPlan.FREE];
}

export interface NotifyFlagInput {
  notifyTelegram?: boolean;
  notifyPush?: boolean;
  notifyWhatsapp?: boolean;
}

export interface ResolvedNotifyFlags {
  notifyPush: boolean;
  notifyTelegram: boolean;
  notifyWhatsapp: boolean;
}

/**
 * Returns the active-filter cap for a plan, or `null` when unlimited.
 */
export function getFilterLimit(plan: SubscriptionPlan): number | null {
  return FILTER_LIMITS[plan] ?? FILTER_LIMITS[SubscriptionPlan.FREE];
}

export function limitReachedMessage(
  plan: SubscriptionPlan,
  limit: number,
): string {
  if (plan === SubscriptionPlan.VIP) {
    return `Mevcut VIP paketinizdeki maksimum alarm sınırına (${limit}) ulaştınız.`;
  }

  if (plan === SubscriptionPlan.PRO) {
    return `PRO paketinizde en fazla ${limit} aktif alarm kullanabilirsiniz. Sınırsız alarm için VIP pakete yükseltin.`;
  }

  return `Ücretsiz planda yalnızca ${limit} aktif alarm kullanabilirsiniz. Daha fazlası için PRO pakete yükseltin.`;
}

/**
 * Rejects notify-channel flags that exceed the user's subscription tier.
 */
export function assertNotifyFlagsForPlan(
  plan: SubscriptionPlan,
  input: NotifyFlagInput,
): void {
  if (
    plan === SubscriptionPlan.FREE &&
    (input.notifyTelegram === true || input.notifyWhatsapp === true)
  ) {
    throw new HttpError(
      "Telegram ve WhatsApp bildirimleri PRO veya VIP paketlerde kullanılabilir",
      403,
      "ForbiddenError",
    );
  }

  if (plan === SubscriptionPlan.PRO && input.notifyWhatsapp === true) {
    throw new HttpError(
      "WhatsApp bildirimleri yalnızca VIP pakette kullanılabilir",
      403,
      "ForbiddenError",
    );
  }
}

/**
 * Normalizes notify flags according to plan rules (used on create/update).
 */
export function resolveNotifyFlagsForPlan(
  plan: SubscriptionPlan,
  input: NotifyFlagInput,
): ResolvedNotifyFlags {
  assertNotifyFlagsForPlan(plan, input);

  const notifyPush = input.notifyPush ?? true;

  switch (plan) {
    case SubscriptionPlan.VIP:
      return {
        notifyPush,
        notifyTelegram: input.notifyTelegram ?? false,
        notifyWhatsapp: input.notifyWhatsapp ?? false,
      };
    case SubscriptionPlan.PRO:
      return {
        notifyPush,
        notifyTelegram: input.notifyTelegram ?? false,
        notifyWhatsapp: false,
      };
    case SubscriptionPlan.FREE:
    default:
      return {
        notifyPush,
        notifyTelegram: false,
        notifyWhatsapp: false,
      };
  }
}

/**
 * Maps subscription plan (+ filter notify flags) to delivery channels.
 *
 * VIP  → Push + Telegram + WhatsApp (when enabled)
 * PRO  → Push + Telegram
 * FREE → Push only
 */
export function resolveNotificationChannels(
  plan: SubscriptionPlan,
  flags: ResolvedNotifyFlags,
): NotificationChannel[] {
  const channels: NotificationChannel[] = [];

  switch (plan) {
    case SubscriptionPlan.VIP: {
      if (flags.notifyPush) {
        channels.push(NotificationChannel.PUSH);
      }
      if (flags.notifyTelegram) {
        channels.push(NotificationChannel.TELEGRAM);
      }
      if (flags.notifyWhatsapp) {
        channels.push(NotificationChannel.WHATSAPP);
      }
      break;
    }
    case SubscriptionPlan.PRO: {
      if (flags.notifyPush) {
        channels.push(NotificationChannel.PUSH);
      }
      if (flags.notifyTelegram) {
        channels.push(NotificationChannel.TELEGRAM);
      }
      break;
    }
    case SubscriptionPlan.FREE:
    default: {
      if (flags.notifyPush) {
        channels.push(NotificationChannel.PUSH);
      }
      break;
    }
  }

  return channels;
}

/**
 * Defense-in-depth channel filter for queued jobs (plan may have changed since enqueue).
 */
export function filterChannelsForPlan(
  plan: SubscriptionPlan,
  channels: NotificationChannel[],
): NotificationChannel[] {
  const allowed = new Set(
    resolveNotificationChannels(plan, {
      notifyPush: true,
      notifyTelegram: true,
      notifyWhatsapp: true,
    }),
  );

  return channels.filter((channel) => allowed.has(channel));
}
