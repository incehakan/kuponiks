import { NotificationChannel, NotificationStatus } from "@prisma/client";
import { toPublicListingImageUrl } from "../../lib/listing-image.js";

export interface UserFacingNotification {
  id: string;
  type: "deal";
  title: string;
  message: string;
  listingId: string;
  dealId: string;
  imageUrl: string | null;
  dealScore: number | null;
  priceAdvantagePct: number | null;
  platform: string | null;
  createdAt: Date;
}

export interface NotificationLogForMapping {
  id: string;
  channel: NotificationChannel | string;
  status: NotificationStatus | string;
  reason: string | null;
  listingId: string;
  sentAt: Date;
  listing: {
    id: string;
    title: string;
    imageUrl: string | null;
    dealScore: number | null;
    priceAdvantagePct: number | null;
    platform: string | null;
    brand?: string | null;
    series?: string | null;
    trim?: string | null;
  };
}

function platformLabel(platform: string | null | undefined): string | null {
  const value = (platform ?? "").trim().toLowerCase();
  if (!value) {
    return null;
  }
  if (value === "arabam") return "Arabam";
  if (value === "sahibinden") return "Sahibinden";
  if (value === "letgo") return "Letgo";
  return platform ?? null;
}

function dealMessage(listing: NotificationLogForMapping["listing"]): string {
  const parts = [listing.brand, listing.series, listing.trim]
    .map((part) => (part ?? "").trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return parts.join(" ");
  }
  return listing.title.trim();
}

export function isUserFacingNotificationLog(
  row: Pick<NotificationLogForMapping, "status" | "reason" | "channel">,
): boolean {
  if (row.status !== NotificationStatus.SENT && row.status !== "SENT") {
    return false;
  }
  const channel = String(row.channel);
  return channel === NotificationChannel.PUSH || channel === NotificationChannel.TELEGRAM ||
    channel === "PUSH" ||
    channel === "TELEGRAM";
}

export function toUserFacingNotification(
  row: NotificationLogForMapping,
): UserFacingNotification | null {
  if (!isUserFacingNotificationLog(row)) {
    return null;
  }

  return {
    id: row.id,
    type: "deal",
    title: "Yeni fırsat bulundu!",
    message: dealMessage(row.listing),
    listingId: row.listingId,
    dealId: row.listing.id,
    imageUrl: toPublicListingImageUrl(row.listing.imageUrl),
    dealScore: row.listing.dealScore,
    priceAdvantagePct: row.listing.priceAdvantagePct,
    platform: platformLabel(row.listing.platform),
    createdAt: row.sentAt,
  };
}
