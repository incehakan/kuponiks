import { env } from "../config/env.js";
import { isRedisAvailable, probeRedisConnection } from "../lib/redis.js";

export type PresenceStatus = "configured" | "missing";
export type AvailabilityStatus = "available" | "unavailable";

/**
 * Operational readiness for notification delivery (presence / availability only).
 * Never includes token values or other secrets.
 */
export interface NotificationOpsHealth {
  redis: AvailabilityStatus;
  expoProvider: AvailabilityStatus;
  expoAccessToken: PresenceStatus;
  telegramBotToken: PresenceStatus;
}

/**
 * Builds a secret-safe ops health snapshot for health routes and smoke preflight.
 */
export async function getNotificationOpsHealth(
  options: { probeRedis?: boolean } = {},
): Promise<NotificationOpsHealth> {
  if (options.probeRedis) {
    await probeRedisConnection();
  }

  return {
    redis: isRedisAvailable() ? "available" : "unavailable",
    // PushProvider + expo-server-sdk are always wired in this codebase.
    expoProvider: "available",
    expoAccessToken: env.EXPO_ACCESS_TOKEN?.trim()
      ? "configured"
      : "missing",
    telegramBotToken: env.TELEGRAM_BOT_TOKEN?.trim()
      ? "configured"
      : "missing",
  };
}

/**
 * Production-only visibility for missing Expo access token.
 * Does not crash the process and never logs the token value.
 */
export function warnMissingProductionExpoAccessToken(): void {
  if (env.NODE_ENV !== "production") {
    return;
  }
  if (env.EXPO_ACCESS_TOKEN?.trim()) {
    return;
  }
  console.warn(
    "[config] Expo access token is not configured (EXPO_ACCESS_TOKEN missing)",
  );
}
