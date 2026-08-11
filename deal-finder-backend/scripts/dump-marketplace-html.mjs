/**
 * One-shot HTML dump on VDS: discovers listing-related CSS classes
 * from Arabam + Hepsiemlak via stealth browser + residential proxy.
 *
 * Usage (on VDS):
 *   cd /var/www/deal-finder-backend && node scripts/dump-marketplace-html.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { addExtra } from "puppeteer-extra";
import puppeteerVanilla from "puppeteer";
import { config as loadDotenv } from "dotenv";

loadDotenv();

const require = createRequire(import.meta.url);
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const puppeteer = addExtra(puppeteerVanilla);
puppeteer.use(StealthPlugin());

const PROXY_URL =
  process.env.RESIDENTIAL_PROXY_URL ||
  process.env.PROXY_URL ||
  (process.env.PROXY_HOST
    ? `http://${encodeURIComponent(process.env.PROXY_USER || "")}:${encodeURIComponent(process.env.PROXY_PASS || "")}@${process.env.PROXY_HOST}:${process.env.PROXY_PORT || "80"}`
    : "");

const TARGETS = [
  {
    name: "arabam",
    url: "https://www.arabam.com/ikinci-el?searchText=istanbul&take=20",
  },
  {
    name: "hepsiemlak",
    url: "https://www.hepsiemlak.com/istanbul-satilik",
  },
];

const CANDIDATE_SELECTORS = [
  // Arabam legacy / modern
  ".listing-list-item",
  "tr.listing-list-item",
  ".listing-modelname",
  ".listing-price",
  ".dbk-price",
  "table.table",
  "[class*='listing']",
  "[class*='Advert']",
  "[class*='advert']",
  "[class*='Product']",
  "a[href*='/ilan/']",
  // Hepsiemlak
  ".list-view-content",
  ".card-link",
  ".list-view-title",
  ".list-view-price",
  ".list-view-location",
  ".listing-item",
  ".listing-detail",
  "[class*='Realty']",
  "[class*='realty']",
  "[class*='Card']",
  "[data-testid*='listing']",
  ".he-main-layout",
];

function proxyServerArg(raw) {
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ""}`;
  } catch {
    return raw;
  }
}

function proxyAuth(raw) {
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    if (!u.username) return undefined;
    return {
      username: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
    };
  } catch {
    return undefined;
  }
}

async function dumpTarget(target) {
  const proxyServer = proxyServerArg(PROXY_URL);
  const auth = proxyAuth(PROXY_URL);
  console.log(`[${target.name}] proxy=${proxyServer || "off"} → ${target.url}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--window-size=1920,1080",
      ...(proxyServer ? [`--proxy-server=${proxyServer}`] : []),
    ],
    ignoreDefaultArgs: ["--enable-automation"],
    defaultViewport: { width: 1920, height: 1080 },
  });

  try {
    const page = await browser.newPage();
    if (auth) await page.authenticate(auth);
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    );
    await page.setExtraHTTPHeaders({
      "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
      "sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
    });

    await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await new Promise((r) => setTimeout(r, 4_000));

    const html = await page.content();
    mkdirSync("./tmp/html-dumps", { recursive: true });
    const htmlPath = `./tmp/html-dumps/${target.name}.html`;
    writeFileSync(htmlPath, html, "utf8");

    const report = await page.evaluate((candidates) => {
      const counts = {};
      for (const sel of candidates) {
        try {
          counts[sel] = document.querySelectorAll(sel).length;
        } catch {
          counts[sel] = -1;
        }
      }

      const ilanAnchors = Array.from(document.querySelectorAll("a[href*='/ilan/']")).slice(0, 8);
      const sampleLinks = ilanAnchors.map((a) => {
        const card =
          a.closest("tr, li, article, [class*='listing'], [class*='card'], [class*='Card'], [class*='item']") ||
          a.parentElement;
        const classes = card
          ? Array.from(card.classList || []).slice(0, 12)
          : [];
        const parentClasses = card?.parentElement
          ? Array.from(card.parentElement.classList || []).slice(0, 12)
          : [];
        return {
          href: a.href,
          text: (a.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
          cardTag: card?.tagName || null,
          cardClasses: classes,
          parentClasses,
        };
      });

      // Top class tokens that appear near listing anchors
      const tokenFreq = {};
      for (const a of Array.from(document.querySelectorAll("a[href*='/ilan/']")).slice(0, 40)) {
        let node = a;
        for (let depth = 0; depth < 5 && node; depth++) {
          for (const c of Array.from(node.classList || [])) {
            tokenFreq[c] = (tokenFreq[c] || 0) + 1;
          }
          node = node.parentElement;
        }
      }
      const topClasses = Object.entries(tokenFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 40)
        .map(([name, count]) => ({ name, count }));

      return {
        title: document.title,
        htmlLen: document.documentElement.outerHTML.length,
        bodyTextPreview: (document.body?.innerText || "").slice(0, 400),
        counts,
        sampleLinks,
        topClasses,
      };
    }, CANDIDATE_SELECTORS);

    const reportPath = `./tmp/html-dumps/${target.name}-report.json`;
    writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
    console.log(`[${target.name}] wrote ${htmlPath} (${html.length} bytes) + ${reportPath}`);
    console.log(`[${target.name}] title=${report.title}`);
    console.log(`[${target.name}] topClasses=`, report.topClasses.slice(0, 15));
    console.log(
      `[${target.name}] nonZeroSelectors=`,
      Object.entries(report.counts).filter(([, n]) => n > 0),
    );
    console.log(`[${target.name}] sampleLinks=`, report.sampleLinks.slice(0, 3));
    return report;
  } finally {
    await browser.close();
  }
}

for (const target of TARGETS) {
  try {
    await dumpTarget(target);
  } catch (err) {
    console.error(`[${target.name}] FAILED`, err);
  }
}

console.log("DUMP_DONE");
