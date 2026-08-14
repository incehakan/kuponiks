/**
 * Listing photo URL hygiene: protocol-relative → https, reject placeholders.
 * Does not invent platform CDN paths or rewrite resolution tokens.
 */

export type ListingImageSource =
  | "json-ld"
  | "data-src"
  | "data-original"
  | "data-lazy"
  | "srcset"
  | "src"
  | "detail-json-ld"
  | "detail-og"
  | "detail-gallery";

const PLACEHOLDER_RE =
  /noimage|no-image|placeholder|default-image|without-photo|favicon|arabam-logo|\/assets2\/|\/logo(?:[-_.\/]|$)|\/blank(?:[-_.\/]|$)/i;

export function normalizeListingImageUrl(
  raw: string | null | undefined,
  baseUrl?: string | null,
): string | null {
  if (!raw?.trim()) {
    return null;
  }

  let value = raw.trim();
  if (/^(data:|javascript:)/i.test(value)) {
    return null;
  }

  if (value.startsWith("//")) {
    value = `https:${value}`;
  }

  if (value.startsWith("/") && baseUrl) {
    try {
      value = new URL(value, baseUrl).toString();
    } catch {
      return null;
    }
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
  return PLACEHOLDER_RE.test(value);
}

/** Persist only real listing photos (never Arabam noImage thumbs). */
export function toStoredListingImageUrl(
  raw: string | null | undefined,
  baseUrl?: string | null,
): string | null {
  const normalized = normalizeListingImageUrl(raw, baseUrl);
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

export function pickBestSrcsetCandidate(
  srcset: string | null | undefined,
): string | null {
  if (!srcset?.trim()) {
    return null;
  }

  const parsed = srcset
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const bits = part.split(/\s+/);
      const url = bits[0] ?? "";
      const desc = bits[1] ?? "";
      const width = desc.endsWith("w")
        ? Number.parseInt(desc.slice(0, -1), 10)
        : null;
      return { url, width: Number.isFinite(width) ? width : null };
    })
    .filter((item) => item.url.length > 0);

  if (parsed.length === 0) {
    return null;
  }

  const mid = parsed.filter(
    (item) => item.width != null && item.width >= 400 && item.width <= 1200,
  );
  if (mid.length > 0) {
    mid.sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
    return mid[0]?.url ?? null;
  }

  const under1600 = parsed.filter(
    (item) => item.width != null && item.width <= 1600,
  );
  if (under1600.length > 0) {
    under1600.sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
    return under1600[0]?.url ?? null;
  }

  return parsed[0]?.url ?? null;
}

/**
 * Prefer already-present mobile-sized URLs (580x435) over 1920px og images.
 * Does not rewrite size tokens in the URL.
 */
export function preferMobileListingImageUrl(
  urls: Array<string | null | undefined>,
  baseUrl?: string | null,
): string | null {
  const stored = urls
    .map((url) => toStoredListingImageUrl(url, baseUrl))
    .filter((url): url is string => Boolean(url));
  if (stored.length === 0) {
    return null;
  }

  const mid = stored.find((url) =>
    /_580x435|_800x|_640x|_720x|_960x/i.test(url),
  );
  if (mid) {
    return mid;
  }

  const notHuge = stored.find((url) => !/_1920x|_3840x|_4k/i.test(url));
  return notHuge ?? stored[0] ?? null;
}

export function pickBestListingImageUrl(
  candidates: Array<string | null | undefined>,
  baseUrl?: string | null,
): string | null {
  return preferMobileListingImageUrl(candidates, baseUrl);
}

export function pickBestListingImage(
  candidates: Array<{
    url: string | null | undefined;
    source: ListingImageSource;
  }>,
  baseUrl?: string | null,
): { url: string; source: ListingImageSource } | null {
  const stored = candidates
    .map((item) => ({
      url: toStoredListingImageUrl(item.url, baseUrl),
      source: item.source,
    }))
    .filter((item): item is { url: string; source: ListingImageSource } =>
      Boolean(item.url),
    );
  if (stored.length === 0) {
    return null;
  }

  const preferred = preferMobileListingImageUrl(
    stored.map((item) => item.url),
    baseUrl,
  );
  const match = stored.find((item) => item.url === preferred);
  return match ?? stored[0] ?? null;
}

/**
 * Image ingest semantics:
 * real → null: keep existing
 * placeholder/null → real: update
 * real → real: update to incoming
 */
export function mergeListingImageUrl(
  existing: string | null | undefined,
  incoming: string | null | undefined,
): string | null {
  const next = toStoredListingImageUrl(incoming);
  if (next) {
    return next;
  }
  const prev = toStoredListingImageUrl(existing);
  return prev;
}

export function mergeRawDetailsImageSource(
  existingRaw: unknown,
  incomingRaw: Record<string, unknown> | null | undefined,
  mergedImageUrl: string | null,
  incomingImageUrl: string | null | undefined,
): Record<string, unknown> {
  const existing =
    existingRaw && typeof existingRaw === "object" && !Array.isArray(existingRaw)
      ? { ...(existingRaw as Record<string, unknown>) }
      : {};
  const incoming = incomingRaw ? { ...incomingRaw } : {};
  const merged = { ...existing, ...incoming };
  const usedIncoming =
    mergedImageUrl != null &&
    mergedImageUrl === toStoredListingImageUrl(incomingImageUrl);

  if (usedIncoming && typeof incoming.imageSource === "string") {
    merged.imageSource = incoming.imageSource;
  } else if (!usedIncoming && typeof existing.imageSource === "string") {
    merged.imageSource = existing.imageSource;
  } else if (!mergedImageUrl) {
    delete merged.imageSource;
  }

  return merged;
}
