import path from "node:path";
import { createRequire } from "node:module";
import { addExtra } from "puppeteer-extra";
import puppeteerVanilla from "puppeteer";
import type { Browser, Page } from "puppeteer";
import { buildProxyUrlFromProcessEnv } from "../proxy-config.js";

const require = createRequire(import.meta.url);
const StealthPlugin = require("puppeteer-extra-plugin-stealth") as () => {
  _isPuppeteerExtraPlugin: boolean;
  [key: string]: unknown;
};

const puppeteer = addExtra(puppeteerVanilla);
puppeteer.use(StealthPlugin());

interface BrowserFingerprint {
  userAgent: string;
  secChUa: string;
  secChUaMobile: string;
  secChUaPlatform: string;
  platform: string;
}

/**
 * Desktop Chrome fingerprints for Cloudflare bypass (UA + Sec-CH-UA aligned).
 */
const DESKTOP_FINGERPRINTS: readonly BrowserFingerprint[] = [
  {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    secChUa: '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    secChUaMobile: "?0",
    secChUaPlatform: '"Windows"',
    platform: "Win32",
  },
  {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    secChUa: '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
    secChUaMobile: "?0",
    secChUaPlatform: '"Windows"',
    platform: "Win32",
  },
  {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    secChUa: '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    secChUaMobile: "?0",
    secChUaPlatform: '"Windows"',
    platform: "Win32",
  },
  {
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    secChUa: '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    secChUaMobile: "?0",
    secChUaPlatform: '"macOS"',
    platform: "MacIntel",
  },
  {
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    secChUa: '"Not.A/Brand";v="8", "Chromium";v="129", "Google Chrome";v="129"',
    secChUaMobile: "?0",
    secChUaPlatform: '"Linux"',
    platform: "Linux x86_64",
  },
] as const;

export interface StealthLaunchOptions {
  /** Subfolder under .browser-data for persistent cookies/profile. */
  profileName: string;
  headless?: boolean;
  /** Override env proxy (http://user:pass@host:port). */
  proxyUrl?: string;
  /**
   * When true (default), uses a unique userDataDir suffix so each retry
   * opens a fresh TCP session through the rotating proxy.
   */
  rotateSession?: boolean;
}

export interface ProxyAuthCredentials {
  username: string;
  password: string;
}

export interface PrepareStealthPageOptions {
  proxyUrl?: string;
  /** Prefer a randomized desktop fingerprint (default true). */
  randomizeFingerprint?: boolean;
}

/**
 * Picks a random aligned UA / Sec-CH-UA fingerprint.
 */
export function pickRandomFingerprint(): BrowserFingerprint {
  const index = Math.floor(Math.random() * DESKTOP_FINGERPRINTS.length);
  return DESKTOP_FINGERPRINTS[index] ?? DESKTOP_FINGERPRINTS[0]!;
}

/**
 * Resolves residential proxy from options or env
 * (`PROXY_*` fields / `RESIDENTIAL_PROXY_URL` / `PROXY_URL`).
 */
export function resolveResidentialProxyUrl(
  override?: string,
): string | undefined {
  const raw =
    override?.trim() ||
    buildProxyUrlFromProcessEnv() ||
    process.env.RESIDENTIAL_PROXY_URL?.trim() ||
    process.env.PROXY_URL?.trim();
  return raw || undefined;
}

/**
 * Converts `http://user:pass@host:port` into a Chromium `--proxy-server` value
 * without credentials (auth is applied via page.authenticate).
 */
export function resolveProxyServerArg(
  proxyUrl?: string,
): string | undefined {
  const raw = resolveResidentialProxyUrl(proxyUrl);
  if (!raw) {
    return undefined;
  }
  try {
    const parsed = new URL(raw);
    return `${parsed.protocol}//${parsed.hostname}${
      parsed.port ? `:${parsed.port}` : ""
    }`;
  } catch {
    return raw;
  }
}

/**
 * Extracts username/password from a proxy URL when present.
 */
export function resolveProxyAuth(
  proxyUrl?: string,
): ProxyAuthCredentials | undefined {
  const raw = resolveResidentialProxyUrl(proxyUrl);
  if (!raw) {
    return undefined;
  }
  try {
    const parsed = new URL(raw);
    if (!parsed.username) {
      return undefined;
    }
    return {
      username: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
    };
  } catch {
    return undefined;
  }
}

/**
 * Applies HTTP proxy authentication to a page (required for user:pass proxies).
 */
export async function applyProxyAuthentication(
  page: Page,
  proxyUrl?: string,
): Promise<void> {
  const auth = resolveProxyAuth(proxyUrl);
  if (!auth) {
    return;
  }
  await page.authenticate({
    username: auth.username,
    password: auth.password,
  });
}

/**
 * Shared puppeteer-extra + stealth browser launcher for marketplace adapters.
 * When `RESIDENTIAL_PROXY_URL` is set, passes `--proxy-server` and authenticates pages.
 */
export async function launchStealthBrowser(
  options: StealthLaunchOptions,
): Promise<Browser> {
  const rotate = options.rotateSession !== false;
  const sessionSuffix = rotate
    ? `-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    : "";
  const userDataDir = path.resolve(
    `./.browser-data/${options.profileName}${sessionSuffix}`,
  );
  const proxyServer = resolveProxyServerArg(options.proxyUrl);

  if (proxyServer) {
    console.log(
      `[puppeteer:${options.profileName}] Residential proxy → ${proxyServer} (rotateSession=${rotate})`,
    );
  }

  const args = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-blink-features=AutomationControlled",
    "--disable-infobars",
    "--disable-dev-shm-usage",
    "--window-size=1920,1080",
    ...(proxyServer ? [`--proxy-server=${proxyServer}`] : []),
  ];

  const browser = await puppeteer.launch({
    headless: options.headless ?? true,
    userDataDir,
    args,
    ignoreDefaultArgs: ["--enable-automation"],
    defaultViewport: { width: 1920, height: 1080 },
  });

  const pages = await browser.pages();
  const page = pages[0] ?? (await browser.newPage());
  await applyProxyAuthentication(page, options.proxyUrl);

  return browser as Browser;
}

/**
 * Applies common page defaults (randomized UA / Sec-CH-UA, locale, proxy auth).
 */
export async function prepareStealthPage(
  page: Page,
  proxyUrlOrOptions?: string | PrepareStealthPageOptions,
): Promise<void> {
  const options: PrepareStealthPageOptions =
    typeof proxyUrlOrOptions === "string"
      ? { proxyUrl: proxyUrlOrOptions }
      : (proxyUrlOrOptions ?? {});

  await applyProxyAuthentication(page, options.proxyUrl);
  await page.setViewport({ width: 1920, height: 1080 });

  const fingerprint =
    options.randomizeFingerprint === false
      ? DESKTOP_FINGERPRINTS[0]!
      : pickRandomFingerprint();

  await page.setUserAgent(fingerprint.userAgent);
  await page.setExtraHTTPHeaders({
    "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "sec-ch-ua": fingerprint.secChUa,
    "sec-ch-ua-mobile": fingerprint.secChUaMobile,
    "sec-ch-ua-platform": fingerprint.secChUaPlatform,
    "Upgrade-Insecure-Requests": "1",
  });

  await page.evaluateOnNewDocument(
    (platform: string) => {
      Object.defineProperty(navigator, "platform", {
        get: () => platform,
      });
      Object.defineProperty(navigator, "webdriver", {
        get: () => false,
      });
      Object.defineProperty(navigator, "languages", {
        get: () => ["tr-TR", "tr", "en-US", "en"],
      });
    },
    fingerprint.platform,
  );

  console.log(
    `[puppeteer] fingerprint UA=${fingerprint.userAgent.slice(0, 72)}… sec-ch-ua=${fingerprint.secChUa}`,
  );

  page.setDefaultTimeout(45_000);
}

/**
 * Waits until Cloudflare interstitial title clears (or timeout).
 * Returns true when page no longer looks like a CF challenge.
 */
export async function waitForCloudflareClearance(
  page: Page,
  options: { timeoutMs?: number; pollMs?: number; label?: string } = {},
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 25_000;
  const pollMs = options.pollMs ?? 2_000;
  const label = options.label ?? "page";
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    try {
      const title = (await page.title()).toLowerCase();
      const blocked =
        title.includes("bir dakika") ||
        title.includes("just a moment") ||
        title.includes("attention required") ||
        title.includes("cloudflare");
      if (!blocked) {
        console.log(
          `[puppeteer:${label}] CF clearance ok after ${Date.now() - started}ms (title="${await page.title()}")`,
        );
        return true;
      }
    } catch {
      // ignore transient evaluate errors during navigation
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }

  console.warn(
    `[puppeteer:${label}] CF clearance timeout (${timeoutMs}ms) title="${(await page.title().catch(() => "?"))}"`,
  );
  return false;
}
