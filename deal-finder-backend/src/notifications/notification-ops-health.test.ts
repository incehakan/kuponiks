import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../config/env.js", () => ({
  env: {
    NODE_ENV: "development",
    EXPO_ACCESS_TOKEN: undefined as string | undefined,
    TELEGRAM_BOT_TOKEN: "bot-token-present",
  },
}));

vi.mock("../lib/redis.js", () => ({
  isRedisAvailable: vi.fn(() => true),
  probeRedisConnection: vi.fn(async () => true),
}));

import { env } from "../config/env.js";
import { isRedisAvailable } from "../lib/redis.js";
import {
  getNotificationOpsHealth,
  warnMissingProductionExpoAccessToken,
} from "./notification-ops-health.js";

describe("Notification ops health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (env as { NODE_ENV: string }).NODE_ENV = "development";
    (env as { EXPO_ACCESS_TOKEN?: string }).EXPO_ACCESS_TOKEN = undefined;
    (env as { TELEGRAM_BOT_TOKEN: string }).TELEGRAM_BOT_TOKEN =
      "bot-token-present";
    vi.mocked(isRedisAvailable).mockReturnValue(true);
  });

  it("reports presence/availability without secrets", async () => {
    const health = await getNotificationOpsHealth();
    expect(health).toEqual({
      redis: "available",
      expoProvider: "available",
      expoAccessToken: "missing",
      telegramBotToken: "configured",
    });
    expect(JSON.stringify(health)).not.toContain("bot-token");
  });

  it("reports redis not_checked when API process did not probe", async () => {
    const health = await getNotificationOpsHealth({ redisMode: "not_checked" });
    expect(health.redis).toBe("not_checked");
  });

  it("warns in production when Expo access token missing", () => {
    (env as { NODE_ENV: string }).NODE_ENV = "production";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    warnMissingProductionExpoAccessToken();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Expo access token is not configured"),
    );
    warn.mockRestore();
  });

  it("does not warn in development when Expo access token missing", () => {
    (env as { NODE_ENV: string }).NODE_ENV = "development";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    warnMissingProductionExpoAccessToken();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
