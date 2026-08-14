export interface SchedulerCycleSnapshot {
  role: string;
  enabled: boolean;
  lastCycleAt: string | null;
  lastCycleDurationMs: number | null;
  lastQueuedJobs: number | null;
  lastDedupSkipped: number | null;
  activeFilterCount: number | null;
  queryGroupCount: number | null;
}

const snapshot: SchedulerCycleSnapshot = {
  role: process.env.PROCESS_ROLE?.trim().toLowerCase() || "unknown",
  enabled: false,
  lastCycleAt: null,
  lastCycleDurationMs: null,
  lastQueuedJobs: null,
  lastDedupSkipped: null,
  activeFilterCount: null,
  queryGroupCount: null,
};

export function getSchedulerHealth(): SchedulerCycleSnapshot {
  return { ...snapshot };
}

export function setSchedulerEnabled(enabled: boolean): void {
  snapshot.enabled = enabled;
  snapshot.role = process.env.PROCESS_ROLE?.trim().toLowerCase() || snapshot.role;
}

export function recordSchedulerCycle(input: {
  durationMs: number;
  queued: number;
  dedupSkipped: number;
  activeFilterCount: number;
  queryGroupCount: number;
}): void {
  snapshot.lastCycleAt = new Date().toISOString();
  snapshot.lastCycleDurationMs = input.durationMs;
  snapshot.lastQueuedJobs = input.queued;
  snapshot.lastDedupSkipped = input.dedupSkipped;
  snapshot.activeFilterCount = input.activeFilterCount;
  snapshot.queryGroupCount = input.queryGroupCount;
}
