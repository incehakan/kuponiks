/**
 * Shared cleanup for smoke scripts — closes Prisma + Redis so Node can exit.
 */
import { disconnectPrisma } from "../../src/lib/prisma.js";
import { disconnectRedis } from "../../src/lib/redis.js";

export async function cleanupSmokeResources(): Promise<void> {
  await disconnectPrisma();
  await disconnectRedis();
}

export function parseSmokeArgs(argv: string[]): {
  userId?: string;
  listingId?: string;
  confirmRealNotification: boolean;
} {
  let userId: string | undefined;
  let listingId: string | undefined;
  let confirmRealNotification = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (arg === "--" || arg === "") {
      continue;
    }
    if (arg === "--confirm-real-notification") {
      confirmRealNotification = true;
      continue;
    }
    if (arg.startsWith("--user=")) {
      userId = arg.slice("--user=".length).trim() || undefined;
      continue;
    }
    if (arg === "--user") {
      userId = (argv[i + 1] ?? "").trim() || undefined;
      i += 1;
      continue;
    }
    if (arg.startsWith("--listing=")) {
      listingId = arg.slice("--listing=".length).trim() || undefined;
      continue;
    }
    if (arg === "--listing") {
      listingId = (argv[i + 1] ?? "").trim() || undefined;
      i += 1;
    }
  }

  return { userId, listingId, confirmRealNotification };
}

