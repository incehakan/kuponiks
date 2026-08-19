/** Extract JSON-LD objects from HTML without logging the document. */

export function parseJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const re =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      // ignore malformed blocks
    }
  }
  return blocks;
}

function asTypes(node: Record<string, unknown>): string[] {
  const raw = node["@type"];
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item));
  }
  if (raw != null) {
    return [String(raw)];
  }
  return [];
}

export function collectJsonLdByType(
  html: string,
  typeName: string,
): Record<string, unknown>[] {
  const wanted = typeName.toLowerCase();
  const out: Record<string, unknown>[] = [];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") {
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    const record = node as Record<string, unknown>;
    if (asTypes(record).some((t) => t.toLowerCase() === wanted)) {
      out.push(record);
    }
    for (const value of Object.values(record)) {
      if (value && typeof value === "object") {
        walk(value);
      }
    }
  };
  for (const block of parseJsonLdBlocks(html)) {
    walk(block);
  }
  return out;
}

export function jsonLdOfferPrice(node: Record<string, unknown>): number | null {
  const offers = node.offers;
  const list = Array.isArray(offers) ? offers : offers ? [offers] : [];
  for (const offer of list) {
    if (!offer || typeof offer !== "object") continue;
    const price = (offer as { price?: unknown }).price;
    if (typeof price === "number" && Number.isFinite(price) && price > 0) {
      return price;
    }
    if (typeof price === "string") {
      const n = Number(price.replace(/[^\d.]/g, ""));
      if (Number.isFinite(n) && n > 0) {
        return n;
      }
    }
  }
  return null;
}
