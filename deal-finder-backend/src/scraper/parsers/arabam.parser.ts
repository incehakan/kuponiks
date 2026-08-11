/**
 * Arabam.com list-page DOM parser.
 *
 * Live structure (2026-08 dump via residential proxy):
 *   tr.listing-list-item#listing{id}[data-imp-id]
 *     td > a > img.listing-image
 *     td.listing-modelname > .listing-text-new  (model)
 *     td > h3 > .listing-text-new.listing-title-lines (title)
 *     td > span.listing-price
 *     td.listing-text > span[title] (city / district)
 *     a.link-overlay[href*='/ilan/']
 */
export const ARABAM_WAIT_SELECTORS = [
  "tr.listing-list-item",
  ".listing-list-item",
  ".listing-price",
  ".listing-modelname",
  "table.listing-table",
] as const;

export const ARABAM_WAIT_SELECTOR = ARABAM_WAIT_SELECTORS.join(", ");

/** Browser-side extract — passed to page.evaluate as a string (no DOM lib in Node). */
export const ARABAM_EXTRACT_SCRIPT = `(() => {
  const results = [];
  const seen = new Set();
  const nodes = Array.from(
    document.querySelectorAll("tr.listing-list-item, .listing-list-item"),
  );

  for (const el of nodes) {
    const linkEl =
      el.querySelector("a.link-overlay[href*='/ilan/']") ||
      el.querySelector("a[href*='/ilan/']");
    const href =
      (linkEl && (linkEl.getAttribute("href") || linkEl.href)) || null;
    if (!href || !/\\/ilan\\//i.test(href)) {
      continue;
    }

    const absoluteUrl = href.startsWith("http")
      ? href
      : "https://www.arabam.com" + (href.startsWith("/") ? "" : "/") + href;
    if (seen.has(absoluteUrl)) {
      continue;
    }
    seen.add(absoluteUrl);

    const idMatch = absoluteUrl.match(/\\/(\\d{5,})(?:\\/)?(?:\\?|$)/);
    const externalId =
      el.getAttribute("data-imp-id") ||
      el.getAttribute("data-id") ||
      (el.id && String(el.id).replace(/^listing/i, "")) ||
      (idMatch && idMatch[1]) ||
      null;

    const titleEl =
      el.querySelector(".listing-text-new.listing-title-lines") ||
      el.querySelector("h3 .listing-text-new, h2 .listing-text-new");
    const title = titleEl
      ? (titleEl.textContent || "").replace(/\\s+/g, " ").trim()
      : null;

    const modelEl = el.querySelector(".listing-modelname .listing-text-new");
    const modelName = modelEl
      ? (modelEl.textContent || "").replace(/\\s+/g, " ").trim()
      : null;

    const priceEl = el.querySelector("span.listing-price, .listing-price");
    const priceText = priceEl
      ? (priceEl.textContent || "").replace(/\\s+/g, " ").trim()
      : null;

    const citySpans = Array.from(
      el.querySelectorAll("td.listing-text span[title], td.listing-text a span"),
    );
    let city = null;
    let district = null;
    if (citySpans.length > 0) {
      const parts = citySpans
        .map((s) => (s.getAttribute("title") || s.textContent || "").trim())
        .filter(Boolean);
      city = parts[0] || null;
      district = parts.length > 1 ? parts.slice(1).join(" / ") : null;
    }

    // Year: dedicated year column (listing-text with YYYY only) — not title scan.
    let year = null;
    const yearCells = Array.from(el.querySelectorAll("td.listing-text"));
    for (const td of yearCells) {
      const text = (td.textContent || "").replace(/\\s+/g, " ").trim();
      if (/^(19|20)\\d{2}$/.test(text)) {
        year = text;
        break;
      }
    }

    // List layout has no dedicated km column; mileage comes from JSON-LD merge in adapter.
    const mileage = null;

    const imgEl =
      el.querySelector("img.listing-image") ||
      el.querySelector("img[src*='ilanfotograf'], img[src*='arbstorage']");
    const imageUrl =
      (imgEl && (imgEl.getAttribute("src") || imgEl.getAttribute("data-src"))) ||
      null;

    if (!title && !priceText && !modelName) {
      continue;
    }

    results.push({
      externalId: externalId,
      title: title || modelName,
      model: modelName,
      priceText: priceText,
      city: city,
      district: district,
      year: year,
      mileage: mileage,
      url: absoluteUrl.split("?")[0],
      imageUrl: imageUrl,
    });
  }

  return results;
})()`;

/** Probe script for selector diagnostics when parse returns empty. */
export const ARABAM_PROBE_SCRIPT = `(() => {
  const sels = ${JSON.stringify([...ARABAM_WAIT_SELECTORS, "a[href*='/ilan/']", "table.table"])};
  const waitSelectorHits = {};
  for (const s of sels) {
    try { waitSelectorHits[s] = document.querySelectorAll(s).length; }
    catch { waitSelectorHits[s] = -1; }
  }
  const tokenFreq = {};
  for (const a of Array.from(document.querySelectorAll("a[href*='/ilan/']")).slice(0, 40)) {
    let n = a;
    for (let d = 0; d < 4 && n; d++) {
      for (const c of Array.from(n.classList || [])) {
        tokenFreq[c] = (tokenFreq[c] || 0) + 1;
      }
      n = n.parentElement;
    }
  }
  const topCardClasses = Object.entries(tokenFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name, count]) => ({ name: name, count: count }));
  const sampleHrefs = Array.from(document.querySelectorAll("a[href*='/ilan/']"))
    .slice(0, 8)
    .map((a) => a.href);
  return {
    title: document.title,
    htmlLength: (document.documentElement && document.documentElement.outerHTML)
      ? document.documentElement.outerHTML.length
      : 0,
    waitSelectorHits: waitSelectorHits,
    topCardClasses: topCardClasses,
    sampleHrefs: sampleHrefs,
  };
})()`;
