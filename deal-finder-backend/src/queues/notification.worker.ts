import { SubscriptionPlan } from "@prisma/client";
import { Worker, type Job } from "bullmq";
import type { Redis } from "ioredis";
import { createBullmqConnection } from "../lib/redis.js";
import { filterChannelsForPlan } from "../lib/subscription-plan.js";
import {
  notificationService,
  type NotificationService,
} from "../notifications/notification.service.js";
import {
  NOTIFICATION_QUEUE_NAME,
  type NotificationJobData,
} from "./notification.queue.js";

/**
 * BullMQ worker that consumes notification jobs and fans out via NotificationService.
 */
export class NotificationWorker {
  private readonly worker: Worker<NotificationJobData>;
  private readonly connection: Redis;

  constructor(
    private readonly service: NotificationService = notificationService,
  ) {
    this.connection = createBullmqConnection();
    this.worker = new Worker<NotificationJobData>(
      NOTIFICATION_QUEUE_NAME,
      async (job: Job<NotificationJobData>) => this.process(job),
      {
        connection: this.connection,
        concurrency: 5,
      },
    );

    this.worker.on("completed", (job) => {
      console.log(`NotificationWorker: job ${job.id} completed`);
    });

    this.worker.on("failed", (job, error) => {
      console.error(
        `NotificationWorker: job ${job?.id ?? "unknown"} failed: ${error.message}`,
      );
    });

    this.worker.on("error", (error) => {
      console.warn(`NotificationWorker error: ${error.message}`);
    });
  }

  /**
   * Processes a single queue job by dispatching to the selected channels.
   */
  private async process(job: Job<NotificationJobData>): Promise<void> {
    const { channels: requestedChannels, subscriptionPlan, ...input } = job.data;
    const delayMs = job.opts.delay ?? 0;
    const plan = subscriptionPlan ?? SubscriptionPlan.FREE;
    const channels = filterChannelsForPlan(plan, requestedChannels ?? []);

    try {
      if (!channels || channels.length === 0) {
        throw new Error(
          `Notification job ${job.id} has no channels allowed for plan ${plan}`,
        );
      }

      if (delayMs > 0) {
        console.log(
          `NotificationWorker: job ${job.id} (${plan}) delivered after ${Math.round(delayMs / 1000)}s plan delay`,
        );
      } else if (plan !== SubscriptionPlan.FREE) {
        console.log(
          `NotificationWorker: job ${job.id} (${plan}) instant delivery via ${channels.join(", ")}`,
        );
      }

      const result = await this.service.dispatch(input, channels);

      console.log(
        `NotificationWorker: job ${job.id} sent=${result.sent} failed=${result.failed}`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown notification worker error";
      console.error(`NotificationWorker: process failed for job ${job.id}: ${message}`);
      // Re-throw so BullMQ applies the configured retry / backoff strategy.
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
          : "Unknown notification worker close error";
      console.error(`Failed to close NotificationWorker: ${message}`);
      try {
        this.connection.disconnect();
      } catch {
        // ignore
      }
    }
  }
}

/**
 * Starts the notification worker only when Redis is available.
 */
export function startNotificationWorker(): NotificationWorker {
  return new NotificationWorker();
}
