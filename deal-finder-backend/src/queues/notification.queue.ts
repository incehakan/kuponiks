import { NotificationChannel } from "@prisma/client";
import { Queue } from "bullmq";
import {
  createBullmqConnection,
  isRedisAvailable,
} from "../lib/redis.js";
import { toBullmqJobId } from "../lib/bullmq-job-id.js";
import type { NotificationDispatchInput } from "../notifications/notification.service.js";
import type { Redis } from "ioredis";

/** BullMQ queue name for outbound notifications. */
export const NOTIFICATION_QUEUE_NAME = "notification-queue";

/**
 * Job payload enqueued for asynchronous multi-channel delivery.
 */
export interface NotificationJobData extends NotificationDispatchInput {
  channels: NotificationChannel[];
}

/**
 * Default job options: 3 attempts with exponential backoff.
 */
export const notificationJobOptions = {
  attempts: 3,
  backoff: {
    type: "exponential" as const,
    delay: 2_000,
  },
  removeOnComplete: 1_000,
  removeOnFail: 5_000,
};

/**
 * Optional BullMQ job overrides for plan-based priority / delay.
 */
export interface EnqueueNotificationOptions {
  priority?: number;
  delay?: number;
}

let queueConnection: Redis | null = null;
let notificationQueue: Queue<NotificationJobData> | null = null;

function getNotificationQueue(): Queue<NotificationJobData> | null {
  if (!isRedisAvailable()) {
    return null;
  }

  if (!notificationQueue) {
    queueConnection = createBullmqConnection();
    notificationQueue = new Queue<NotificationJobData>(NOTIFICATION_QUEUE_NAME, {
      connection: queueConnection,
      defaultJobOptions: notificationJobOptions,
    });
  }

  return notificationQueue;
}

/**
 * Enqueues a notification job for background processing.
 * Never throws — Redis/BullMQ failures are logged and skipped.
 */
export async function enqueueNotification(
  data: NotificationJobData,
  options: EnqueueNotificationOptions = {},
): Promise<string | undefined> {
  const queue = getNotificationQueue();
  if (!queue) {
    console.warn(
      "[BullMQ] Redis yok — notification job atlandı (HTTP API etkilenmez)",
    );
    return undefined;
  }

  try {
    const job = await queue.add("send-notification", data, {
      ...notificationJobOptions,
      ...(options.priority !== undefined ? { priority: options.priority } : {}),
      ...(options.delay !== undefined ? { delay: options.delay } : {}),
      jobId: toBullmqJobId(
        `${data.userId}:${data.listingId}:${[...data.channels].sort().join(",")}`,
      ),
    });

    return job.id;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown notification enqueue error";
    console.error(`Failed to enqueue notification job: ${message}`);
    return undefined;
  }
}

/**
 * Gracefully closes the notification queue and its Redis connection.
 */
export async function closeNotificationQueue(): Promise<void> {
  try {
    if (notificationQueue) {
      await notificationQueue.close();
      notificationQueue = null;
    }
    if (queueConnection) {
      await queueConnection.quit();
      queueConnection = null;
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown notification queue close error";
    console.error(`Failed to close notification queue: ${message}`);
    try {
      queueConnection?.disconnect();
    } catch {
      // ignore
    }
    queueConnection = null;
    notificationQueue = null;
  }
}
