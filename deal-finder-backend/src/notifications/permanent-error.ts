/**
 * Permanent delivery errors must not be retried by BullMQ.
 */
export class PermanentNotificationError extends Error {
  readonly permanent = true as const;
  readonly reason: string;

  constructor(reason: string, message: string) {
    super(message);
    this.name = "PermanentNotificationError";
    this.reason = reason;
  }
}

export function isPermanentNotificationError(
  error: unknown,
): error is PermanentNotificationError {
  return (
    error instanceof PermanentNotificationError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { permanent?: boolean }).permanent === true)
  );
}
