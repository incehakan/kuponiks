import { prisma } from "../lib/prisma.js";

/**
 * Persist filter↔listing matches without using exceptions for duplicates.
 * Unique (userId, filterId, listingId) + createMany skipDuplicates:
 * - no P2002 log noise on re-match
 * - matchedAt stays the first-match timestamp (existing rows not updated)
 */
export async function persistUserListingMatches(input: {
  userId: string;
  listingId: string;
  dealScore: number;
  filterIds: string[];
}): Promise<{ created: number; existing: number }> {
  const uniqueFilterIds = [...new Set(input.filterIds.filter(Boolean))];
  if (uniqueFilterIds.length === 0) {
    return { created: 0, existing: 0 };
  }

  const result = await prisma.userListingMatch.createMany({
    data: uniqueFilterIds.map((filterId) => ({
      userId: input.userId,
      filterId,
      listingId: input.listingId,
      dealScore: input.dealScore,
    })),
    skipDuplicates: true,
  });

  const created = result.count;
  const existing = uniqueFilterIds.length - created;

  return { created, existing };
}
