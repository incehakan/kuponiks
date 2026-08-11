import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

/**
 * Persist filter↔listing matches. Unique (userId, filterId, listingId) prevents duplicates.
 * Returns number of newly created rows.
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

  let created = 0;
  let existing = 0;

  for (const filterId of uniqueFilterIds) {
    try {
      await prisma.userListingMatch.create({
        data: {
          userId: input.userId,
          filterId,
          listingId: input.listingId,
          dealScore: input.dealScore,
        },
      });
      created += 1;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        existing += 1;
        continue;
      }
      throw error;
    }
  }

  return { created, existing };
}
