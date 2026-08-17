export interface ParsedArabamListingRow {
  year: number | null;
  price: number | null;
  city: string | null;
}

function parsePriceText(text: string): number | null {
  const digits = text.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

/** Lightweight HTML row parser for verify script (no puppeteer). */
export function parseArabamListingRows(html: string): ParsedArabamListingRow[] {
  const rows: ParsedArabamListingRow[] = [];
  const rowRe =
    /<tr[^>]*class="[^"]*listing-list-item[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
  let match: RegExpExecArray | null;
  while ((match = rowRe.exec(html)) !== null) {
    const chunk = match[1] ?? "";
    if (!/\/ilan\//i.test(chunk)) continue;

    const priceMatch = chunk.match(
      /<span[^>]*class="[^"]*listing-price[^"]*"[^>]*>([^<]+)</i,
    );
    const price = priceMatch ? parsePriceText(priceMatch[1] ?? "") : null;

    const cityMatch = chunk.match(
      /<td[^>]*class="[^"]*listing-text[^"]*"[^>]*>[\s\S]*?<span[^>]*title="([^"]+)"/i,
    );
    const city = cityMatch?.[1]?.trim() ?? null;

    let year: number | null = null;
    const yearCellRe =
      /<td[^>]*class="[^"]*listing-text[^"]*"[^>]*>\s*(19|20)\d{2}\s*<\/td>/gi;
    const yearMatch = yearCellRe.exec(chunk);
    if (yearMatch) {
      year = Number(yearMatch[0].replace(/\D/g, ""));
    }

    rows.push({ year, price, city });
  }
  return rows;
}
