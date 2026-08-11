import type { Listing, UserFilter } from "@prisma/client";
import { NotificationChannel, NotificationStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { normalizeMatchText } from "../lib/text-normalize.js";

export type EligibilityReason =
  | "ok"
  | "inactive_filter"
  | "below_min_deal_score"
  | "market_not_ready"
  | "already_sent"
  | "no_token"
  | "channel_disabled"
  | "no_channels";

export interface EligibilityResult {
  eligible: boolean;
  reason: EligibilityReason;
}

/**
 * Vehicle opportunity notifications require Market Intelligence READY.
 * Unsupported/non-vehicle categories may notify when score criteria already passed
 * at match time — still prefer READY when marketStatus is set for vehicles.
 */
export function isVehicleOpportunityCategory(
  category: string | null | undefined,
): boolean {
  const n = normalizeMatchText(category);
  return (
    n.includes("vasıta") ||
    n.includes("vasita") ||
    n.includes("otomobil") ||
    n.includes("vehicle")
  );
}

export function isMarketReadyForOpportunity(
  listing: Pick<Listing, "marketStatus" | "category">,
): boolean {
  const status = (listing.marketStatus ?? "").trim().toUpperCase();
  if (status === "READY") {
    return true;
  }

  // Non-vehicle / unsupported MI: do not send "fırsat" notifications without READY.
  // Keyword watchers without market data should not look like priced opportunities.
  return false;
}

export function canMatchActiveFilter(filter: Pick<UserFilter, "isActive">): boolean {
  return filter.isActive !== false;
}

export function passesUserMinDealScore(
  listingDealScore: number,
  filterMinDealScore: number | null | undefined,
): boolean {
  if (filterMinDealScore == null || !Number.isFinite(filterMinDealScore)) {
    return true;
  }
  return listingDealScore >= filterMinDealScore;
}

/**
 * Whether this listing may generate an opportunity notification for a matched filter.
 */
export function canNotifyUserForListing(
  listing: Pick<Listing, "dealScore" | "marketStatus" | "category">,
  filter: Pick<UserFilter, "isActive" | "minDealScore">,
): EligibilityResult {
  if (!canMatchActiveFilter(filter)) {
    return { eligible: false, reason: "inactive_filter" };
  }
  if (!passesUserMinDealScore(listing.dealScore, filter.minDealScore)) {
    return { eligible: false, reason: "below_min_deal_score" };
  }
  if (!isMarketReadyForOpportunity(listing)) {
    return { eligible: false, reason: "market_not_ready" };
  }
  return { eligible: true, reason: "ok" };
}

/**
 * Permanent channel dedup: SENT means never send again for this triple.
 */
export async function hasSuccessfulChannelNotification(
  userId: string,
  listingId: string,
  channel: NotificationChannel,
): Promise<boolean> {
  const existing = await prisma.notificationLog.findFirst({
    where: {
      userId,
      listingId,
      channel,
      status: NotificationStatus.SENT,
    },
    select: { id: true },
  });
  return Boolean(existing);
}

export async function filterChannelsNeedingDelivery(
  userId: string,
  listingId: string,
  channels: NotificationChannel[],
): Promise<{
  pending: NotificationChannel[];
  skipped: Array<{ channel: NotificationChannel; reason: EligibilityReason }>;
}> {
  const pending: NotificationChannel[] = [];
  const skipped: Array<{
    channel: NotificationChannel;
    reason: EligibilityReason;
  }> = [];

  for (const channel of channels) {
    if (await hasSuccessfulChannelNotification(userId, listingId, channel)) {
      skipped.push({ channel, reason: "already_sent" });
      continue;
    }
    pending.push(channel);
  }

  return { pending, skipped };
}

/**
 * Build user-facing push/Telegram body from listing MI fields.
 */
export function buildOpportunityNotificationCopy(listing: {
  title: string;
  price: number;
  currency?: string | null;
  dealScore: number;
  priceAdvantagePct?: number | null;
  marketMedianPrice?: number | null;
  city?: string | null;
  district?: string | null;
  platform?: string | null;
}): { title: string; message: string; telegramMessage: string } {
  const priceLabel = listing.price.toLocaleString("tr-TR", {
    style: "currency",
    currency: (listing.currency ?? "TRY").trim() || "TRY",
    maximumFractionDigits: 0,
  });

  const advantage =
    listing.priceAdvantagePct != null && Number.isFinite(listing.priceAdvantagePct)
      ? listing.priceAdvantagePct
      : null;

  const advantageLine =
    advantage == null
      ? null
      : advantage >= 0
        ? `Piyasanın %${advantage.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} altında`
        : `Piyasanın %${Math.abs(advantage).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} üstünde`;

  const title = "🔥 Kuponiks fırsat bulundu";
  const messageParts = [
    listing.title,
    priceLabel,
    `Fırsat Skoru: ${listing.dealScore}`,
    ...(advantageLine ? [advantageLine] : []),
  ];
  const message = messageParts.join("\n");

  const location = [listing.city, listing.district].filter(Boolean).join(" / ");
  const median =
    listing.marketMedianPrice != null
      ? listing.marketMedianPrice.toLocaleString("tr-TR", {
          style: "currency",
          currency: (listing.currency ?? "TRY").trim() || "TRY",
          maximumFractionDigits: 0,
        })
      : null;

  const telegramLines = [
    "*Kuponiks Fırsat*",
    "",
    escapeTelegramMarkdown(listing.title),
    "",
    `Fiyat: ${priceLabel}`,
    ...(median ? [`Piyasa Medyanı: ${median}`] : []),
    ...(advantageLine ? [`Avantaj: ${advantageLine}`] : []),
    `Skor: ${listing.dealScore}`,
    ...(location ? [`Konum: ${escapeTelegramMarkdown(location)}`] : []),
    ...(listing.platform
      ? [`Kaynak: ${escapeTelegramMarkdown(listing.platform)}`]
      : []),
  ];

  return {
    title,
    message,
    telegramMessage: telegramLines.join("\n"),
  };
}

function escapeTelegramMarkdown(value: string): string {
  return value.replace(/([_*`\[\]])/g, "\\$1");
}
