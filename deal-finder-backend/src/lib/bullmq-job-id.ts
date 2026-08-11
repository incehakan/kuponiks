/**
 * BullMQ custom job IDs cannot contain `:`.
 * Normalize any composed id (e.g. `listing-match:cuid` → `listing-match-cuid`).
 */
export function toBullmqJobId(raw: string): string {
  return raw.replace(/:/g, "-");
}
