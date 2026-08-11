import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";

/**
 * Global cache for PrismaClient to avoid exhausting connections
 * during hot-reload in development (tsx watch / nodemon).
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

/**
 * Creates a PrismaClient wired to PostgreSQL via the official pg adapter (Prisma v7+).
 */
function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    // Align closer to historical Prisma pool defaults
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 300_000,
  });

  return new PrismaClient({
    adapter,
    log:
      env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

/** Singleton Prisma client used across the application. */
export const prisma: PrismaClient =
  globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Gracefully disconnects the Prisma client and underlying pool.
 */
export async function disconnectPrisma(): Promise<void> {
  try {
    await prisma.$disconnect();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Prisma disconnect error";
    console.error(`Failed to disconnect Prisma: ${message}`);
    throw error;
  }
}
