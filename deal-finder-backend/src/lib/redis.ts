import { Redis, type RedisOptions } from "ioredis";
import { env } from "../config/env.js";

/**
 * Global cache for Redis to survive hot-reload in development.
 */
const globalForRedis = globalThis as unknown as {
  redis?: Redis;
  redisAvailable?: boolean;
  redisProbePromise?: Promise<boolean>;
};

const MAX_RECONNECT_ATTEMPTS = 3;

/**
 * Shared ioredis options that fail fast and never block the HTTP event loop
 * when Redis is down (no offline command queue, limited reconnects).
 */
function buildRedisOptions(
  overrides: {
    maxRetriesPerRequest: number | null;
    /** Omit / leave undefined to disable commandTimeout (needed for BullMQ blocking cmds). */
    commandTimeoutMs?: number | null;
  },
): RedisOptions {
  const options: RedisOptions = {
    maxRetriesPerRequest: overrides.maxRetriesPerRequest,
    enableReadyCheck: true,
    lazyConnect: true,
    // Critical: do not queue commands forever when Redis is unreachable.
    enableOfflineQueue: false,
    connectTimeout: 5_000,
    retryStrategy(times: number): number | null {
      if (times > MAX_RECONNECT_ATTEMPTS) {
        globalForRedis.redisAvailable = false;
        console.warn(
          `[Redis] Yeniden bağlanma bırakıldı (${MAX_RECONNECT_ATTEMPTS} deneme). HTTP API Redis olmadan devam ediyor.`,
        );
        return null;
      }
      return Math.min(times * 250, 1_000);
    },
  };

  // commandTimeout is supported at runtime; cast keeps TS happy across ioredis versions.
  // Default 15s for app Redis; BullMQ should omit it (blocking BRPOP/BZPOP can exceed any short timeout).
  const withTimeout =
    overrides.commandTimeoutMs === null
      ? options
      : ({
          ...options,
          commandTimeout: overrides.commandTimeoutMs ?? 15_000,
        } as RedisOptions);

  return withTimeout;
}

function attachLifecycleHandlers(client: Redis, label: string): void {
  client.on("error", (error: Error) => {
    globalForRedis.redisAvailable = false;
    // Avoid flooding logs on every reconnect tick.
    if (
      error.message.includes("ECONNREFUSED") ||
      error.message.includes("Connection is closed") ||
      error.message.includes("Command timed out")
    ) {
      console.warn(`[${label}] bağlantı yok: ${error.message}`);
      return;
    }
    console.error(`[${label}] hata: ${error.message}`);
  });

  client.on("connect", () => {
    globalForRedis.redisAvailable = true;
    if (env.NODE_ENV === "development") {
      console.log(`[${label}] bağlandı`);
    }
  });

  client.on("ready", () => {
    globalForRedis.redisAvailable = true;
  });

  client.on("end", () => {
    globalForRedis.redisAvailable = false;
  });
}

/**
 * Creates an ioredis client with fail-fast defaults (HTTP-safe).
 */
function createRedisClient(): Redis {
  const client = createConfiguredRedis(
    buildRedisOptions({
      maxRetriesPerRequest: 1,
      commandTimeoutMs: 15_000,
    }),
  );
  return attachAndReturn(client, "Redis");
}

function createConfiguredRedis(options: RedisOptions): Redis {
  // Force the (url, options) overload — ioredis typings quarrel with null retries.
  return new (Redis as unknown as new (
    url: string,
    options: RedisOptions,
  ) => Redis)(env.REDIS_URL, options);
}

function attachAndReturn(client: Redis, label: string): Redis {
  attachLifecycleHandlers(client, label);
  return client;
}

/** Singleton Redis client for caching and queue coordination. */
export const redis = globalForRedis.redis ?? createRedisClient();

if (env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}

/**
 * Creates a dedicated ioredis connection for BullMQ.
 * BullMQ requires `maxRetriesPerRequest: null` for blocking commands.
 * commandTimeout is disabled so BRPOP / workers are not killed by short timeouts.
 */
export function createBullmqConnection(): Redis {
  const options = buildRedisOptions({
    maxRetriesPerRequest: null,
    commandTimeoutMs: null,
  });

  if (options.maxRetriesPerRequest !== null) {
    throw new Error(
      "BullMQ Redis: maxRetriesPerRequest must be null (blocking commands).",
    );
  }

  const client = createConfiguredRedis(options);
  return attachAndReturn(client, "BullMQ Redis");
}

/**
 * Returns the last known Redis availability flag (best-effort).
 */
export function isRedisAvailable(): boolean {
  return globalForRedis.redisAvailable === true;
}

/**
 * Probes Redis once at startup. Never throws — HTTP server can boot either way.
 */
export async function probeRedisConnection(): Promise<boolean> {
  if (globalForRedis.redisProbePromise) {
    return globalForRedis.redisProbePromise;
  }

  globalForRedis.redisProbePromise = (async () => {
    try {
      if (redis.status === "wait" || redis.status === "end") {
        await redis.connect();
      }
      const pong = await redis.ping();
      const ok = pong === "PONG";
      globalForRedis.redisAvailable = ok;
      if (ok) {
        console.log("[Redis] Hazır — kuyruklar etkin");
      }
      return ok;
    } catch (error) {
      globalForRedis.redisAvailable = false;
      const message =
        error instanceof Error ? error.message : "Bilinmeyen Redis hatası";
      console.warn(
        `[Redis] Kullanılamıyor (${message}). Queue worker'lar devre dışı; GET /api/filters ve /api/deals etkilenmez.`,
      );
      try {
        redis.disconnect();
      } catch {
        // ignore
      }
      return false;
    }
  })();

  return globalForRedis.redisProbePromise;
}

/**
 * Safe Redis SET NX EX wrapper — returns null on failure instead of hanging.
 */
export async function redisSetNxEx(
  key: string,
  value: string,
  ttlSeconds: number,
): Promise<string | null> {
  try {
    if (!isRedisAvailable() && redis.status !== "ready") {
      return null;
    }
    return await redis.set(key, value, "EX", ttlSeconds, "NX");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Redis SET error";
    console.warn(`[Redis] SET başarısız (atlanıyor): ${message}`);
    return null;
  }
}

/**
 * Safe Redis EXISTS wrapper — returns 0 on failure instead of hanging.
 */
export async function redisExists(key: string): Promise<number> {
  try {
    if (!isRedisAvailable() && redis.status !== "ready") {
      return 0;
    }
    return await redis.exists(key);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Redis EXISTS error";
    console.warn(`[Redis] EXISTS başarısız (atlanıyor): ${message}`);
    return 0;
  }
}

/**
 * Safe Redis SET EX wrapper — never throws.
 */
export async function redisSetEx(
  key: string,
  value: string,
  ttlSeconds: number,
): Promise<void> {
  try {
    if (!isRedisAvailable() && redis.status !== "ready") {
      return;
    }
    await redis.set(key, value, "EX", ttlSeconds);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Redis SET EX error";
    console.warn(`[Redis] SET EX başarısız (atlanıyor): ${message}`);
  }
}

/**
 * Safe Redis DEL wrapper — never throws.
 */
export async function redisDel(key: string): Promise<void> {
  try {
    if (!isRedisAvailable() && redis.status !== "ready") {
      return;
    }
    await redis.del(key);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Redis DEL error";
    console.warn(`[Redis] DEL başarısız (atlanıyor): ${message}`);
  }
}

/**
 * Gracefully closes the Redis connection (QUIT).
 */
export async function disconnectRedis(): Promise<void> {
  try {
    if (redis.status === "end" || redis.status === "wait") {
      return;
    }

    await redis.quit();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Redis disconnect error";
    console.error(`Failed to disconnect Redis cleanly: ${message}`);

    // Force-close if QUIT fails so the process can exit.
    try {
      redis.disconnect();
    } catch {
      // ignore
    }
  }
}
