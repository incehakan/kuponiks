/**
 * Hepsiemlak.com list-page DOM parser.
 *
 * Site often serves Cloudflare interstitial ("Bir dakika lütfen...") first.
 * After clearance, cards vary; we combine classic list-view selectors with
 * href-driven card discovery for /{city}-satilik and /ilan/ style links.
 */
export const HEPSIEMLAK_WAIT_SELECTORS = [
  ".list-view-content",
  ".card-link",
  "a.card-link",
  ".listing-item",
  ".listing-detail",
  "[class*='list-view']",
  "[class*='RealtyCard']",
  "[class*='realty-card']",
  "li[class*='listing']",
  "article[class*='listing']",
  "a[href*='-satilik']",
  "a[href*='-kiralik']",
] as const;

export const HEPSIEMLAK_WAIT_SELECTOR = HEPSIEMLAK_WAIT_SELECTORS.join(", ");

export const HEPSIEMLAK_EXTRACT_SCRIPT = `(() => {
  const results = [];
  const seen = new Set();

  const cardSelectors = [
    ".list-view-content .card-link",
    "a.card-link",
    ".listing-item",
    ".listing-detail",
    "li[class*='listing']",
    "article[class*='listing']",
    "[class*='RealtyCard']",
    "[class*='realty-card']",
    "[class*='list-view'] a[href]",
  ];

  let nodes = [];
  for (const sel of cardSelectors) {
    try {
      const found = Array.from(document.querySelectorAll(sel));
      if (found.length > 0) {
        nodes = found;
        break;
      }
    } catch (_) {}
  }

  if (nodes.length === 0) {
    nodes = Array.from(document.querySelectorAll("a[href]"))
      .filter((a) => {
        const h = a.getAttribute("href") || a.href || "";
        return (
          /\\/(satilik|kiralik)[\\/?#]/i.test(h) ||
          /-(satilik|kiralik)(\\/|$)/i.test(h) ||
          /\\/ilan\\//i.test(h)
        );
      })
      .map(
        (a) =>
          a.closest(
            "li, article, .card-link, [class*='list'], [class*='card'], [class*='Card'], [class*='listing']",
          ) || a,
      )
      .filter((el, idx, arr) => arr.indexOf(el) === idx)
      .slice(0, 60);
  }

  for (const el of nodes) {
    const linkEl =
      el.matches && el.matches("a[href]")
        ? el
        : el.querySelector(
            "a.card-link, a[href*='-satilik'], a[href*='-kiralik'], a[href*='/ilan/'], a[href]",
          );
    const href =
      (linkEl && (linkEl.getAttribute("href") || linkEl.href)) || null;
    if (!href) {
      continue;
    }

    const absoluteUrl = href.startsWith("http")
      ? href
      : "https://www.hepsiemlak.com" + (href.startsWith("/") ? "" : "/") + href;

    if (!/hepsiemlak\\.com/i.test(absoluteUrl)) {
      continue;
    }
    // Skip pure navigation / category hubs without a detail slug.
    if (
      !/-(satilik|kiralik)/i.test(absoluteUrl) &&
      !/\\/ilan\\//i.test(absoluteUrl) &&
      !/\\/\\d{5,}(?:\\/|$)/.test(absoluteUrl)
    ) {
      continue;
    }
    if (seen.has(absoluteUrl)) {
      continue;
    }
    seen.add(absoluteUrl);

    const idMatch =
      absoluteUrl.match(/\\/(\\d{5,})(?:\\/)?(?:\\?|$)/) ||
      absoluteUrl.match(/[?&]id=(\\d+)/i);
    const externalId =
      el.getAttribute("data-id") ||
      el.getAttribute("data-listing-id") ||
      (linkEl &&
        (linkEl.getAttribute("data-id") ||
          linkEl.getAttribute("data-listing-id"))) ||
      (idMatch && idMatch[1]) ||
      absoluteUrl;

    const titleEl = el.querySelector(
      ".list-view-title, .card-title, [class*='title'], h3, h2, h1",
    );
    let title = titleEl
      ? (titleEl.textContent || "").replace(/\\s+/g, " ").trim()
      : null;
    if (!title && linkEl) {
      title =
        (linkEl.getAttribute("title") || "").trim() ||
        (linkEl.textContent || "").replace(/\\s+/g, " ").trim() ||
        null;
    }
    if (title && title.length > 180) {
      title = title.slice(0, 180).trim();
    }

    const priceEl = el.querySelector(
      ".list-view-price, .price, [class*='price'], [data-testid*='price']",
    );
    const priceText = priceEl
      ? (priceEl.textContent || "").replace(/\\s+/g, " ").trim()
      : null;

    const locationEl = el.querySelector(
      ".list-view-location, .location, [class*='location'], [class*='city'], [class*='district']",
    );
    const city = locationEl
      ? (locationEl.textContent || "").replace(/\\s+/g, " ").trim()
      : null;

    const imgEl = el.querySelector(
      "img[src], img[data-src], img[data-lazy], picture img",
    );
    const imageUrl =
      (imgEl &&
        (imgEl.getAttribute("src") ||
          imgEl.getAttribute("data-src") ||
          imgEl.getAttribute("data-lazy"))) ||
      null;

    if (!title) {
      continue;
    }

    results.push({
      externalId: String(externalId),
      title: title,
      priceText: priceText,
      city: city,
      url: absoluteUrl.split("?")[0],
      imageUrl: imageUrl,
    });
  }

  return results;
})()`;

export const HEPSIEMLAK_PROBE_SCRIPT = `(() => {
  const sels = ${JSON.stringify([...HEPSIEMLAK_WAIT_SELECTORS, "a[href*='satilik']", "a[href*='ilan']"])};
  const waitSelectorHits = {};
  for (const s of sels) {
    try { waitSelectorHits[s] = document.querySelectorAll(s).length; }
    catch { waitSelectorHits[s] = -1; }
  }
  const tokenFreq = {};
  const anchors = Array.from(document.querySelectorAll("a[href]")).filter((a) => {
    const h = a.getAttribute("href") || "";
    return /satilik|kiralik|ilan/i.test(h);
  }).slice(0, 40);
  for (const a of anchors) {
    let n = a;
    for (let d = 0; d < 5 && n; d++) {
      for (const c of Array.from(n.classList || [])) {
        tokenFreq[c] = (tokenFreq[c] || 0) + 1;
      }
      n = n.parentElement;
    }
  }
  const topCardClasses = Object.entries(tokenFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([name, count]) => ({ name: name, count: count }));
  const sampleHrefs = anchors.slice(0, 8).map((a) => a.href);
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
