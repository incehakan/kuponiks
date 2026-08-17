/**
 * Read-only production snapshot: Honda Civic notify flags + eligibility dry-run.
 * Does not mutate DB or send push.
 *
 * Usage: npx tsx scripts/prod-notify-pref-snapshot.ts
 */
import "dotenv/config";
import { NotificationStatus } from "@prisma/client";
import { listingMatchesFilter } from "../src/filters/filter-match.engine.js";
import { prisma } from "../src/lib/prisma.js";
import { canNotifyUserForListing } from "../src/notifications/notification-eligibility.js";

const FILTER_ID = "6a70c7f0-c475-470b-a5f7-def15bebf885";
const USER_ID = "04aba9f7-6103-43df-b5dc-c72a2bd340f0";

async function main(): Promise<void> {
  const filter = await prisma.userFilter.findUnique({ where: { id: FILTER_ID } });
  if (!filter) throw new Error("filter missing");

  const user = await prisma.user.findUnique({
    where: { id: filter.userId },
    select: { id: true, expoPushToken: true, subscriptionPlan: true },
  });

  const matches = await prisma.userListingMatch.count({
    where: { filterId: FILTER_ID },
  });
  const sent = await prisma.notificationLog.count({
    where: { userId: USER_ID, status: NotificationStatus.SENT },
  });
  const skipped = await prisma.notificationLog.count({
    where: { userId: USER_ID, status: NotificationStatus.SKIPPED },
  });

  const listing = await prisma.listing.findFirst({
    where: {
      brand: { equals: "Honda", mode: "insensitive" },
      series: { equals: "Civic", mode: "insensitive" },
      marketStatus: "READY",
      dealScore: { gte: filter.minDealScore ?? 0 },
      ...(filter.minYear != null ? { year: { gte: filter.minYear } } : {}),
    },
    orderBy: { dealScore: "desc" },
  });

  let dry = null;
  if (listing) {
    const el = canNotifyUserForListing(listing, filter);
    const alreadySent = await prisma.notificationLog.findFirst({
      where: {
        userId: USER_ID,
        listingId: listing.id,
        status: NotificationStatus.SENT,
      },
      select: { id: true },
    });
    const yearOk =
      (filter.minYear == null || (listing.year != null && listing.year >= filter.minYear)) &&
      (filter.maxYear == null || (listing.year != null && listing.year <= filter.maxYear));
    dry = {
      listingId: listing.id,
      year: listing.year,
      mileage: listing.mileage,
      dealScore: listing.dealScore,
      marketStatus: listing.marketStatus,
      matcherPass: listingMatchesFilter(listing, filter) && yearOk,
      filterActive: filter.isActive,
      notifyPush: filter.notifyPush,
      hasExpoToken: Boolean(user?.expoPushToken),
      minDealScore: filter.minDealScore,
      alreadySent: Boolean(alreadySent),
      eligible: el.eligible,
      eligibilityReason: el.reason,
      wouldPush:
        el.eligible &&
        filter.notifyPush === true &&
        Boolean(user?.expoPushToken) &&
        !alreadySent,
    };
  }

  console.log(
    JSON.stringify(
      {
        snapshot: {
          id: filter.id,
          userId: filter.userId,
          name: filter.name,
          isActive: filter.isActive,
          notifyPush: filter.notifyPush,
          notifyTelegram: filter.notifyTelegram,
          notifyWhatsapp: filter.notifyWhatsapp,
          brand: filter.brand,
          series: filter.series,
          trim: filter.trim,
          minYear: filter.minYear,
          maxYear: filter.maxYear,
          minMileage: filter.minMileage,
          maxMileage: filter.maxMileage,
          minDealScore: filter.minDealScore,
          updatedAt: filter.updatedAt,
        },
        user: {
          id: user?.id,
          subscriptionPlan: user?.subscriptionPlan,
          hasExpoPushToken: Boolean(user?.expoPushToken),
        },
        userListingMatch: matches,
        notificationSent: sent,
        notificationSkipped: skipped,
        dryEligibility: dry,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
