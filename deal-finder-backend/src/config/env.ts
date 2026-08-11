import { config as loadDotenv } from "dotenv";

loadDotenv();

/**
 * Required environment variable names for the application.
 */
const REQUIRED_ENV_KEYS = [
  "DATABASE_URL",
  "REDIS_URL",
  "PORT",
  "JWT_SECRET",
  "TELEGRAM_BOT_TOKEN",
  "WHATSAPP_API_URL",
  "WHATSAPP_API_KEY",
  "FIREBASE_CREDENTIALS_PATH",
] as const;

type RequiredEnvKey = (typeof REQUIRED_ENV_KEYS)[number];

/**
 * Strongly-typed application environment configuration.
 */
export interface AppEnv {
  DATABASE_URL: string;
  REDIS_URL: string;
  PORT: number;
  JWT_SECRET: string;
  TELEGRAM_BOT_TOKEN: string;
  /** Public @username without @ — used for t.me deep links */
  TELEGRAM_BOT_USERNAME?: string;
  WHATSAPP_API_URL: string;
  WHATSAPP_API_KEY: string;
  FIREBASE_CREDENTIALS_PATH: string;
  /**
   * Optional residential proxy URL (e.g. http://user:pass@host:port).
   * When omitted, scrapers connect directly unless PROXY_HOST/PORT are set.
   */
  PROXY_URL?: string;
  /**
   * Optional Puppeteer residential proxy (preferred over PROXY_URL for browsers).
   */
  RESIDENTIAL_PROXY_URL?: string;
  /** When false, scrapers ignore proxy settings. Default true when host/url set. */
  PROXY_ENABLED?: boolean;
  PROXY_HOST?: string;
  PROXY_PORT?: number;
  PROXY_USER?: string;
  PROXY_PASS?: string;
  /**
   * Optional Expo Push access token for production rate limits.
   */
  EXPO_ACCESS_TOKEN?: string;
  /** ScraperScheduler interval in ms (default 900000 = 15m). */
  SCRAPER_SCHEDULE_INTERVAL_MS?: number;
  /** Active payment provider: iyzico | paytr | garanti | revenuecat */
  ACTIVE_PAYMENT_PROVIDER?: string;
  NODE_ENV: "development" | "production" | "test";
}

/**
 * Reads a required string env var or throws a clear validation error.
 */
function requireString(key: RequiredEnvKey): string {
  const value = process.env[key]?.trim();

  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}. Check your .env file or deployment secrets.`,
    );
  }

  return value;
}

/**
 * Reads an optional string env var; returns undefined when empty/missing.
 */
function optionalString(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
}

/**
 * Parses and validates PORT as a positive integer.
 */
function parsePort(raw: string): number {
  const port = Number.parseInt(raw, 10);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(
      `Invalid PORT value "${raw}". Expected an integer between 1 and 65535.`,
    );
  }

  return port;
}

/**
 * Normalizes NODE_ENV to a known union member.
 */
function parseNodeEnv(raw: string | undefined): AppEnv["NODE_ENV"] {
  if (raw === "production" || raw === "test" || raw === "development") {
    return raw;
  }

  return "development";
}

/**
 * Validates all required environment variables and returns a typed config object.
 * Import this module instead of reading process.env directly.
 */
function loadEnv(): AppEnv {
  for (const key of REQUIRED_ENV_KEYS) {
    requireString(key);
  }

  const proxyUrl = optionalString("PROXY_URL");
  const residentialProxyUrl = optionalString("RESIDENTIAL_PROXY_URL");
  const proxyEnabledRaw = optionalString("PROXY_ENABLED");
  const proxyHost = optionalString("PROXY_HOST");
  const proxyPortRaw = optionalString("PROXY_PORT");
  const proxyUser = optionalString("PROXY_USER");
  const proxyPass = optionalString("PROXY_PASS");
  const expoAccessToken = optionalString("EXPO_ACCESS_TOKEN");
  const scraperIntervalRaw = optionalString("SCRAPER_SCHEDULE_INTERVAL_MS");
  const telegramBotUsername = optionalString("TELEGRAM_BOT_USERNAME");

  // Compose PROXY_URL from discrete Webshare fields when full URL is absent.
  let composedProxyUrl = proxyUrl;
  if (!composedProxyUrl && proxyHost && proxyPortRaw) {
    const auth =
      proxyUser !== undefined
        ? `${encodeURIComponent(proxyUser)}:${encodeURIComponent(proxyPass ?? "")}@`
        : "";
    composedProxyUrl = `http://${auth}${proxyHost}:${proxyPortRaw}`;
  }

  const proxyEnabled =
    proxyEnabledRaw === undefined
      ? Boolean(composedProxyUrl || residentialProxyUrl)
      : !["0", "false", "no", "off"].includes(proxyEnabledRaw.toLowerCase());

  const effectiveProxyUrl = proxyEnabled
    ? composedProxyUrl ?? residentialProxyUrl
    : undefined;

  const config: AppEnv = {
    DATABASE_URL: requireString("DATABASE_URL"),
    REDIS_URL: requireString("REDIS_URL"),
    PORT: parsePort(requireString("PORT")),
    JWT_SECRET: requireString("JWT_SECRET"),
    TELEGRAM_BOT_TOKEN: requireString("TELEGRAM_BOT_TOKEN"),
    WHATSAPP_API_URL: requireString("WHATSAPP_API_URL"),
    WHATSAPP_API_KEY: requireString("WHATSAPP_API_KEY"),
    FIREBASE_CREDENTIALS_PATH: requireString("FIREBASE_CREDENTIALS_PATH"),
    NODE_ENV: parseNodeEnv(process.env.NODE_ENV),
  };

  if (proxyEnabledRaw !== undefined) {
    config.PROXY_ENABLED = proxyEnabled;
  }
  if (proxyHost !== undefined) {
    config.PROXY_HOST = proxyHost;
  }
  if (proxyPortRaw !== undefined) {
    const port = Number.parseInt(proxyPortRaw, 10);
    if (Number.isInteger(port) && port > 0) {
      config.PROXY_PORT = port;
    }
  }
  if (proxyUser !== undefined) {
    config.PROXY_USER = proxyUser;
  }
  if (proxyPass !== undefined) {
    config.PROXY_PASS = proxyPass;
  }
  if (effectiveProxyUrl !== undefined) {
    config.PROXY_URL = effectiveProxyUrl;
    config.RESIDENTIAL_PROXY_URL = residentialProxyUrl ?? effectiveProxyUrl;
  } else if (residentialProxyUrl !== undefined && proxyEnabled) {
    config.RESIDENTIAL_PROXY_URL = residentialProxyUrl;
  }
  if (expoAccessToken !== undefined) {
    config.EXPO_ACCESS_TOKEN = expoAccessToken;
  }
  if (scraperIntervalRaw !== undefined) {
    const parsed = Number.parseInt(scraperIntervalRaw, 10);
    if (Number.isFinite(parsed) && parsed >= 60_000) {
      config.SCRAPER_SCHEDULE_INTERVAL_MS = parsed;
    }
  }
  if (telegramBotUsername !== undefined) {
    config.TELEGRAM_BOT_USERNAME = telegramBotUsername.replace(/^@/, "");
  }

  if (config.PROXY_URL) {
    console.log(
      `[env] Scraper proxy enabled → ${config.PROXY_HOST ?? "url"}:${config.PROXY_PORT ?? "?"}`,
    );
  }

  return config;
}

export const env: AppEnv = loadEnv();
