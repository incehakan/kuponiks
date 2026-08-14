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
  return (
    value.includes('/noimage/') ||
    value.includes('noimage') ||
    value.includes('no-image') ||
    value.includes('placeholder') ||
    value.includes('default-image')
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
