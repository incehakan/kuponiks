import { Queue } from "bullmq";
import type { Prisma } from "@prisma/client";
import type { Redis } from "ioredis";
import {
  createBullmqConnection,
  isRedisAvailable,
} from "../lib/redis.js";
import { toBullmqJobId } from "../lib/bullmq-job-id.js";

/** BullMQ queue name for deal listings awaiting user-filter matching. */
export const LISTING_MATCH_QUEUE_NAME = "listing-match-queue";

/**
 * Job payload pushed when a listing clears the deal-score threshold.
 */
export interface ListingMatchJobData {
  listingId: string;
  externalId: string;
  platform: string;
  title: string;
  price: number;
  marketAveragePrice?: number;
  dealScore: number;
  city?: string;
  url: string;
  rawDetails?: Prisma.JsonValue;
}

/**
 * Default job options for listing-match work.
 */
export const listingMatchJobOptions = {
  attempts: 3,
  backoff: {
    type: "exponential" as const,
    delay: 2_000,
  },
  removeOnComplete: 1_000,
  removeOnFail: 5_000,
};

let queueConnection: Redis | null = null;
let listingMatchQueue: Queue<ListingMatchJobData> | null = null;

function getListingMatchQueue(): Queue<ListingMatchJobData> | null {
  if (!isRedisAvailable()) {
    return null;
  }

  if (!listingMatchQueue) {
    queueConnection = createBullmqConnection();
    listingMatchQueue = new Queue<ListingMatchJobData>(LISTING_MATCH_QUEUE_NAME, {
      connection: queueConnection,
      defaultJobOptions: listingMatchJobOptions,
    });
  }

  return listingMatchQueue;
}

/**
 * Enqueues a listing for downstream filter matching.
 * Never throws — Redis/BullMQ failures are logged and skipped.
 */
export async function enqueueListingMatch(
  data: ListingMatchJobData,
): Promise<string | undefined> {
  const queue = getListingMatchQueue();
  if (!queue) {
    console.warn(
      "[BullMQ] Redis yok — listing-match job atlandı (HTTP API etkilenmez)",
    );
    return undefined;
  }

  try {
    const job = await queue.add("match-listing", data, {
      ...listingMatchJobOptions,
      jobId: toBullmqJobId(`listing-match:${data.listingId}`),
    });

    return job.id;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown listing-match enqueue error";
    console.error(`Failed to enqueue listing-match job: ${message}`);
    return undefined;
  }
}

/**
 * Gracefully closes the listing-match queue and its Redis connection.
 */
export async function closeListingMatchQueue(): Promise<void> {
  try {
    if (listingMatchQueue) {
      await listingMatchQueue.close();
      listingMatchQueue = null;
    }
    if (queueConnection) {
      await queueConnection.quit();
      queueConnection = null;
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown listing-match queue close error";
    console.error(`Failed to close listing-match queue: ${message}`);
    try {
      queueConnection?.disconnect();
    } catch {
      // ignore
    }
    queueConnection = null;
    listingMatchQueue = null;
  }
}
