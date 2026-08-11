import { Worker, type Job } from "bullmq";
import type { Redis } from "ioredis";
import { createBullmqConnection } from "../lib/redis.js";
import {
  filterMatchingService,
  type FilterMatchingService,
} from "../filters/filter-matching.service.js";
import {
  LISTING_MATCH_QUEUE_NAME,
  type ListingMatchJobData,
} from "./listing.queue.js";

/**
 * BullMQ worker that consumes listing-match-queue jobs and runs the
 * Filter Matching Engine against active user filters.
 */
export class ListingMatchWorker {
  private readonly worker: Worker<ListingMatchJobData>;
  private readonly connection: Redis;

  constructor(
    private readonly matchingService: FilterMatchingService = filterMatchingService,
  ) {
    this.connection = createBullmqConnection();
    this.worker = new Worker<ListingMatchJobData>(
      LISTING_MATCH_QUEUE_NAME,
      async (job: Job<ListingMatchJobData>) => this.process(job),
      {
        connection: this.connection,
        concurrency: 5,
      },
    );

    this.worker.on("completed", (job) => {
      console.log(`ListingMatchWorker: job ${job.id} completed`);
    });

    this.worker.on("failed", (job, error) => {
      console.error(
        `ListingMatchWorker: job ${job?.id ?? "unknown"} failed: ${error.message}`,
      );
    });

    this.worker.on("error", (error) => {
      console.warn(`ListingMatchWorker error: ${error.message}`);
    });
  }

  /**
   * Processes a single listing-match job via FilterMatchingService.
   */
  private async process(job: Job<ListingMatchJobData>): Promise<void> {
    const listingId = job.data.listingId;

    try {
      if (!listingId?.trim()) {
        throw new Error(
          `ListingMatchWorker: job ${job.id} is missing listingId`,
        );
      }

      await this.matchingService.matchListingWithFilters(listingId);

      console.log(
        `ListingMatchWorker: matched filters for listing ${listingId} (job ${job.id})`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown listing-match worker error";
      console.error(
        `ListingMatchWorker: process failed for job ${job.id}: ${message}`,
      );
      // Re-throw so BullMQ applies retry / backoff.
      throw error;
    }
  }

  /**
   * Gracefully stops the worker and closes its Redis connection.
   */
  async close(): Promise<void> {
    try {
      await this.worker.close();
      await this.connection.quit();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown listing-match worker close error";
      console.error(`Failed to close ListingMatchWorker: ${message}`);
      try {
        this.connection.disconnect();
      } catch {
        // ignore
      }
    }
  }
}

/**
 * Starts the listing-match worker only when Redis is available.
 */
export function startListingMatchWorker(): ListingMatchWorker {
  return new ListingMatchWorker();
}
