import { Client } from "ssh2";

const password = process.env.VDS_PASSWORD || "";
if (!password) {
  console.error("VDS_PASSWORD required");
  process.exit(1);
}

const remote = `#!/bin/bash
set -e
cd /var/www/deal-finder-backend
node --input-type=module <<'NODE'
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

const PROXY_URL = process.env.RESIDENTIAL_PROXY_URL || process.env.PROXY_URL || "";
const u = new URL(PROXY_URL);
const proxyServer = u.protocol + "//" + u.hostname + (u.port ? ":" + u.port : "");
const auth = { username: decodeURIComponent(u.username), password: decodeURIComponent(u.password) };

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox","--disable-setuid-sandbox","--disable-blink-features=AutomationControlled","--disable-dev-shm-usage","--window-size=1920,1080","--proxy-server=" + proxyServer],
  ignoreDefaultArgs: ["--enable-automation"],
  defaultViewport: { width: 1920, height: 1080 },
});
const page = await browser.newPage();
await page.authenticate(auth);
await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");
await page.setExtraHTTPHeaders({
  "Accept-Language": "tr-TR,tr;q=0.9",
  "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
});
await page.goto("https://www.hepsiemlak.com/istanbul-satilik", { waitUntil: "domcontentloaded", timeout: 60000 });
for (let i = 0; i < 10; i++) {
  await new Promise(r => setTimeout(r, 2500));
  const title = await page.title();
  console.log("t", i, title);
  if (!/bir dakika|just a moment|attention required|cloudflare/i.test(title)) break;
}
await new Promise(r => setTimeout(r, 2000));
const html = await page.content();
mkdirSync("./tmp/html-dumps", { recursive: true });
writeFileSync("./tmp/html-dumps/hepsiemlak2.html", html);
console.log("htmlLen", html.length);

const report = await page.evaluate(() => {
  const anchors = Array.from(document.querySelectorAll("a[href]")).filter((a) =>
    /\\/(satilik|kiralik|ilan)/i.test(a.getAttribute("href") || a.href)
  ).slice(0, 20);
  const sample = anchors.map((a) => {
    const card = a.closest("li, article, div[class], section") || a;
    return {
      href: (a.href || "").slice(0, 140),
      text: (a.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 70),
      cardTag: card.tagName,
      cardClasses: Array.from(card.classList || []).slice(0, 12),
      parentClasses: Array.from((card.parentElement && card.parentElement.classList) || []).slice(0, 12),
    };
  });
  const tokenFreq = {};
  for (const a of anchors) {
    let n = a;
    for (let d = 0; d < 6 && n; d++) {
      for (const c of Array.from(n.classList || [])) tokenFreq[c] = (tokenFreq[c] || 0) + 1;
      n = n.parentElement;
    }
  }
  const top = Object.entries(tokenFreq).sort((a, b) => b[1] - a[1]).slice(0, 40);
  const sels = [
    ".list-view-content", ".card-link", ".listing-item", ".listing-detail",
    "[class*='list-view']", "[class*='RealtyCard']", "[class*='realty']",
    "[class*='Card']", "[class*='card']", "article", "li",
    ".he-main-layout", "[data-testid]", ".price", "[class*='price']",
    "[class*='title']", "[class*='location']"
  ];
  const counts = {};
  for (const s of sels) {
    try { counts[s] = document.querySelectorAll(s).length; } catch { counts[s] = -1; }
  }
  return { title: document.title, counts, sample, top };
});
writeFileSync("./tmp/html-dumps/hepsiemlak2-report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2).slice(0, 10000));
await browser.close();
NODE
`;

const conn = new Client();
conn
  .on("ready", () => {
    conn.exec(remote, { pty: true }, (err, stream) => {
      if (err) {
        console.error(err);
        process.exit(1);
      }
      stream.on("data", (d) => process.stdout.write(d.toString()));
      stream.on("close", (code) => {
        conn.end();
        process.exit(code || 0);
      });
    });
  })
  .connect({
    host: "45.43.152.58",
    port: 25416,
    username: "root",
    password,
    readyTimeout: 120_000,
  });
