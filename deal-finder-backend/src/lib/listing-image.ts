/**
 * Listing photo URL hygiene: protocol-relative → https, reject placeholders.
 * Does not invent platform CDN paths.
 */

export function normalizeListingImageUrl(
  raw: string | null | undefined,
): string | null {
  if (!raw?.trim()) {
    return null;
  }

  let value = raw.trim();
  if (value.startsWith("//")) {
    value = `https:${value}`;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol === "http:") {
      parsed.protocol = "https:";
    }
    if (parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function isPlaceholderListingImage(
  url: string | null | undefined,
): boolean {
  const value = (url ?? "").toLowerCase();
  if (!value) {
    return true;
  }
  return (
    value.includes("/noimage/") ||
    value.includes("noimage") ||
    value.includes("no-image") ||
    value.includes("placeholder") ||
    value.includes("default-image") ||
    value.includes("without-photo")
  );
}

/** Persist only real listing photos (never Arabam noImage thumbs). */
export function toStoredListingImageUrl(
  raw: string | null | undefined,
): string | null {
  const normalized = normalizeListingImageUrl(raw);
  if (!normalized || isPlaceholderListingImage(normalized)) {
    return null;
  }
  return normalized;
}

/** API/mobile display URL — placeholders become null so clients use fallback. */
export function toPublicListingImageUrl(
  raw: string | null | undefined,
): string | null {
  return toStoredListingImageUrl(raw);
}

export function pickBestListingImageUrl(
  candidates: Array<string | null | undefined>,
): string | null {
  for (const candidate of candidates) {
    const stored = toStoredListingImageUrl(candidate);
    if (stored) {
      return stored;
    }
  }
  return null;
}
