/**
 * Treat Arabam noImage thumbs as missing photos. Do not invent CDN paths.
 */
export function normalizeListingImageUrl(
  raw: string | null | undefined,
): string | null {
  if (!raw?.trim()) {
    return null;
  }
  let value = raw.trim();
  if (/^(data:|javascript:)/i.test(value)) {
    return null;
  }
  if (value.startsWith('//')) {
    value = `https:${value}`;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'http:') {
      parsed.protocol = 'https:';
    }
    if (parsed.protocol !== 'https:') {
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
  const value = (url ?? '').toLowerCase();
  if (!value) {
    return true;
  }
  return /noimage|no-image|placeholder|default-image|without-photo|favicon|arabam-logo|\/assets2\//i.test(
    value,
  );
}

export function toDisplayListingImageUrl(
  raw: string | null | undefined,
): string | null {
  const normalized = normalizeListingImageUrl(raw);
  if (!normalized || isPlaceholderListingImage(normalized)) {
    return null;
  }
  return normalized;
}
