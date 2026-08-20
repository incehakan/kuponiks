export const LETGO_ORIGIN = "https://www.letgo.com";
export const LETGO_SEARCH_ITEMS_PATH = "/api/search/items";
/** Public car category used by letgo.com search-ssr (`araba-15706_c15706`). */
export const LETGO_CAR_CATEGORY_ID = "15706";

export interface LetgoParsedListing {
  externalId: string;
  url: string;
  title: string;
  price: number | null;
  currency: string | null;
  brand: string | null;
  series: string | null;
  trim: string | null;
  year: number | null;
  mileage: number | null;
  city: string | null;
  district: string | null;
  imageUrl: string | null;
  sellerType: string | null;
}

export interface LetgoSearchParseResult {
  listings: LetgoParsedListing[];
  nextPageUrl: string | null;
  empty: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function letgoFilterSlug(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ş", "s")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function parseLetgoListingId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return String(Math.trunc(value));
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  const iid = trimmed.match(/iid-(\d{6,})/i);
  if (iid?.[1]) {
    return iid[1];
  }
  if (/^\d{6,}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

export function buildLetgoItemUrl(id: string, title: string): string {
  const slug = letgoFilterSlug(title) || "item";
  return `${LETGO_ORIGIN}/item/${slug}-iid-${id}`;
}

export function isLetgoPlaceholderImage(url: string | null | undefined): boolean {
  if (!url?.trim()) {
    return true;
  }
  return /placeholder|no[-_]?image|nophoto|default[-_]?image/i.test(url);
}

export function resolveLetgoNextPageUrl(next: unknown): string | null {
  if (typeof next !== "string") {
    return null;
  }
  const trimmed = next.trim();
  if (!trimmed) {
    return null;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  const query = trimmed.replace(/^\?/, "");
  return `${LETGO_ORIGIN}${LETGO_SEARCH_ITEMS_PATH}?${query}`;
}

export function parseLetgoSubTitle(subTitle: string | null | undefined): {
  year: number | null;
  mileage: number | null;
} {
  if (!subTitle?.trim()) {
    return { year: null, mileage: null };
  }
  const yearMatch = subTitle.match(/\b((?:19|20)\d{2})\b/);
  const year = yearMatch ? Number.parseInt(yearMatch[1]!, 10) : null;
  const kmMatch = subTitle.match(/(\d{1,3}(?:[.\s]\d{3})+|\d+)\s*KM/i);
  let mileage: number | null = null;
  if (kmMatch?.[1]) {
    const digits = kmMatch[1].replace(/[.\s]/g, "");
    const parsed = Number.parseInt(digits, 10);
    mileage = Number.isFinite(parsed) ? parsed : null;
  }
  return {
    year: year && year >= 1950 && year <= 2100 ? year : null,
    mileage,
  };
}

function eidMap(
  extra: unknown,
): Record<string, string> {
  const extraRec = asRecord(extra);
  const eids = asRecord(extraRec?.eids);
  const data = Array.isArray(eids?.data) ? eids.data : [];
  const out: Record<string, string> = {};
  for (const row of data) {
    const rec = asRecord(row);
    const title = typeof rec?.title === "string" ? rec.title.trim() : "";
    const value = typeof rec?.value === "string" ? rec.value.trim() : "";
    if (title && value) {
      out[title] = value;
    }
  }
  return out;
}

function extractPrice(item: Record<string, unknown>): {
  price: number | null;
  currency: string | null;
} {
  const priceNode = item.price;
  if (typeof priceNode === "number" && Number.isFinite(priceNode) && priceNode > 0) {
    return { price: priceNode, currency: "TRY" };
  }
  const rec = asRecord(priceNode);
  const value = asRecord(rec?.value);
  const raw = value?.raw ?? rec?.raw ?? rec?.amount;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    const display = typeof value?.display === "string" ? value.display : "";
    return { price: raw, currency: /tl|₺/i.test(display) ? "TRY" : "TRY" };
  }
  return { price: null, currency: null };
}

function extractImageUrl(item: Record<string, unknown>): string | null {
  if (typeof item.imageUrl === "string" && item.imageUrl.startsWith("http")) {
    return item.imageUrl;
  }
  const images = Array.isArray(item.images) ? item.images : [];
  for (const entry of images) {
    const rec = asRecord(entry);
    const big = asRecord(rec?.big);
    if (typeof big?.url === "string" && big.url.startsWith("http")) {
      return big.url;
    }
  }
  const image = asRecord(item.image);
  const externalId =
    typeof image?.external_id === "string" ? image.external_id.trim() : "";
  if (externalId) {
    return `https://imvm.letgo.com/v1/files/${externalId}/image;s=640x640`;
  }
  return null;
}

function titleCaseToken(value: string): string {
  const slug = letgoFilterSlug(value);
  if (!slug) {
    return value.trim();
  }
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

function parseBrandSeries(
  title: string,
  eids: Record<string, string>,
): { brand: string | null; series: string | null; trim: string | null } {
  const marka = eids["Marka Adı"]?.trim() || null;
  const ticari = eids["Ticari Adı"]?.trim() || null;
  const brand = marka ? titleCaseToken(marka) : null;

  let series: string | null = null;
  let trim: string | null = null;
  if (ticari) {
    const parts = ticari.split(/\s+/).filter(Boolean);
    if (parts[0]) {
      series = titleCaseToken(parts[0]);
      const rest = parts.slice(1).join(" ").trim();
      trim = rest || null;
    }
  }

  if (!brand || !series) {
    const tokens = title.trim().split(/\s+/).filter(Boolean);
    if (!brand && tokens[0]) {
      return {
        brand: titleCaseToken(tokens[0]!),
        series: series ?? (tokens[1] ? titleCaseToken(tokens[1]) : null),
        trim,
      };
    }
    if (!series && tokens[1]) {
      series = titleCaseToken(tokens[1]);
    }
  }

  return { brand, series, trim };
}

export function parseLetgoSearchItem(raw: unknown): LetgoParsedListing | null {
  const item = asRecord(raw);
  if (!item) {
    return null;
  }
  const externalId = parseLetgoListingId(item.id);
  const title = typeof item.title === "string" ? item.title.trim() : "";
  if (!externalId || !title) {
    return null;
  }
  const { price, currency } = extractPrice(item);
  const sub =
    typeof item.sub_title === "string" ? parseLetgoSubTitle(item.sub_title) : { year: null, mileage: null };
  const eids = eidMap(item.extra_parameters);
  const yearFromEid = eids["Model Yılı"]
    ? Number.parseInt(eids["Model Yılı"], 10)
    : null;
  const year =
    yearFromEid && yearFromEid >= 1950 && yearFromEid <= 2100
      ? yearFromEid
      : sub.year;
  const loc = asRecord(item.locations_resolved);
  const city =
    typeof loc?.ADMIN_LEVEL_3_name === "string"
      ? loc.ADMIN_LEVEL_3_name.trim()
      : typeof item.city_name === "string"
        ? item.city_name.trim()
        : null;
  const district =
    typeof loc?.SUBLOCALITY_LEVEL_1_name === "string"
      ? loc.SUBLOCALITY_LEVEL_1_name.trim()
      : typeof item.district_name === "string"
        ? item.district_name.trim()
        : null;
  const imageUrlRaw = extractImageUrl(item);
  const imageUrl = isLetgoPlaceholderImage(imageUrlRaw) ? null : imageUrlRaw;
  const { brand, series, trim } = parseBrandSeries(title, eids);
  const sellerType =
    typeof item.user_type === "string" && item.user_type.trim()
      ? item.user_type.trim()
      : null;

  return {
    externalId,
    url: buildLetgoItemUrl(externalId, title),
    title,
    price,
    currency: price != null ? currency : null,
    brand,
    series,
    trim,
    year,
    mileage: sub.mileage,
    city: city || null,
    district: district || null,
    imageUrl,
    sellerType,
  };
}

export function parseLetgoSearchJson(payload: string): LetgoSearchParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload) as unknown;
  } catch {
    return { listings: [], nextPageUrl: null, empty: true };
  }
  return parseLetgoSearchPayload(parsed);
}

export function parseLetgoSearchPayload(parsed: unknown): LetgoSearchParseResult {
  const root = asRecord(parsed);
  if (!root) {
    return { listings: [], nextPageUrl: null, empty: true };
  }
  const data = Array.isArray(root.data) ? root.data : [];
  const listings: LetgoParsedListing[] = [];
  const seen = new Set<string>();
  for (const row of data) {
    try {
      const listing = parseLetgoSearchItem(row);
      if (!listing) {
        continue;
      }
      if (seen.has(listing.externalId)) {
        continue;
      }
      seen.add(listing.externalId);
      listings.push(listing);
    } catch {
      // skip broken item
    }
  }
  const metadata = asRecord(root.metadata);
  const nextPageUrl = resolveLetgoNextPageUrl(metadata?.next_page_url);
  const empty = listings.length === 0 || root.empty === true;
  return { listings, nextPageUrl, empty };
}

export function isLetgoBotChallenge(body: string): boolean {
  const head = body.slice(0, 4000);
  return /bm-verify|Bot Manager|akamai/i.test(head);
}
