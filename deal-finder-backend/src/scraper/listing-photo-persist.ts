import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import {
  mergeListingImageUrl,
  mergeRawDetailsImageSource,
  toStoredListingImageUrl,
  type ListingImageSource,
} from "../lib/listing-image.js";

/**
 * Image-only persist. Does not change DealScore, market fields, or enqueue notify.
 */
export async function persistListingPhotoOnly(input: {
  listingId: string;
  imageUrl: string;
  imageSource: ListingImageSource;
}): Promise<{ updated: boolean; imageUrl: string | null }> {
  const existing = await prisma.listing.findUnique({
    where: { id: input.listingId },
    select: { id: true, imageUrl: true, rawDetails: true },
  });
  if (!existing) {
    return { updated: false, imageUrl: null };
  }

  const mergedImageUrl = mergeListingImageUrl(existing.imageUrl, input.imageUrl);
  const incomingStored = toStoredListingImageUrl(input.imageUrl);
  if (!mergedImageUrl) {
    return { updated: false, imageUrl: toStoredListingImageUrl(existing.imageUrl) };
  }

  const sameAsExisting =
    mergedImageUrl === toStoredListingImageUrl(existing.imageUrl);
  if (sameAsExisting && incomingStored && incomingStored !== mergedImageUrl) {
    return { updated: false, imageUrl: mergedImageUrl };
  }

  const rawDetails = mergeRawDetailsImageSource(
    existing.rawDetails,
    { imageSource: input.imageSource },
    mergedImageUrl,
    input.imageUrl,
  );

  await prisma.listing.update({
    where: { id: existing.id },
    data: {
      imageUrl: mergedImageUrl,
      lastSeenAt: new Date(),
      rawDetails: rawDetails as Prisma.InputJsonValue,
    },
  });

  return { updated: true, imageUrl: mergedImageUrl };
}
