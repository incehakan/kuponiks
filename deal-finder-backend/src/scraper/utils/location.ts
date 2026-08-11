/**
 * Splits location strings commonly emitted as "İzmir / Bornova" or "İzmir, Bornova".
 */
export function splitCityDistrict(
  location: string | null | undefined,
): { city: string | null; district: string | null } {
  if (!location?.trim()) {
    return { city: null, district: null };
  }

  const normalized = location.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  const parts = normalized
    .split(/\s*[/,|]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return { city: null, district: null };
  }
  if (parts.length === 1) {
    return { city: parts[0]!, district: null };
  }

  return {
    city: parts[0]!,
    district: parts.slice(1).join(" / "),
  };
}
