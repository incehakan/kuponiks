import { SubscriptionPlan } from "@prisma/client";
import { getScrapeIntervalMs } from "../lib/subscription-plan.js";
import type { ProviderReliability } from "./coverage-types.js";

/**
 * Reduced scrape cadence for providers that are not producing data.
 * Explicit env wins. Unset: enabled in development/test, disabled in production.
 */
export function isProviderProbeCadenceEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env.PROVIDER_PROBE_CADENCE_ENABLED?.trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "on" || raw === "yes") {
    return true;
  }
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") {
    return false;
  }
  return env.NODE_ENV !== "production";
}

export function getDegradedProbeIntervalMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.PROVIDER_DEGRADED_PROBE_MINUTES?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : 30;
  const minutes =
    Number.isFinite(parsed) && parsed >= 5 && parsed <= 180 ? parsed : 30;
  return minutes * 60 * 1000;
}

/**
 * HEALTHY / UNKNOWN keep plan cadence (VIP 5m).
 * NO_DATA / DEGRADED probe at most every PROVIDER_DEGRADED_PROBE_MINUTES when enabled.
 */
export function resolveProviderScrapeIntervalMs(
  plan: SubscriptionPlan,
  reliability: ProviderReliability = "UNKNOWN",
  env: NodeJS.ProcessEnv = process.env,
): number {
  const base = getScrapeIntervalMs(plan);
  if (!isProviderProbeCadenceEnabled(env)) {
    return base;
  }
  if (reliability === "NO_DATA" || reliability === "DEGRADED") {
    return Math.max(base, getDegradedProbeIntervalMs(env));
  }
  return base;
}

export function lastAttemptAtFromAttempts(
  attempts: Array<{ at: string }> | undefined,
): string | null {
  if (!attempts || attempts.length === 0) {
    return null;
  }
  return attempts[attempts.length - 1]?.at ?? null;
}

export function computeNextProbeAt(
  lastAttemptAt: string | null,
  nowMs: number,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const interval = getDegradedProbeIntervalMs(env);
  const lastMs = lastAttemptAt ? Date.parse(lastAttemptAt) : Number.NaN;
  const baseMs = Number.isFinite(lastMs) ? lastMs : nowMs;
  return new Date(baseMs + interval).toISOString();
}

/**
 * When probe cadence is off, every schedulable platform is due.
 * NO_DATA/DEGRADED wait until lastAttempt + probe interval.
 */
export function shouldEnqueueDegradedProbe(input: {
  reliability: ProviderReliability;
  lastAttemptAt: string | null;
  nowMs?: number;
  env?: NodeJS.ProcessEnv;
}): { due: boolean; nextProbeAt: string | null } {
  const env = input.env ?? process.env;
  const nowMs = input.nowMs ?? Date.now();
  if (!isProviderProbeCadenceEnabled(env)) {
    return { due: true, nextProbeAt: null };
  }
  if (
    input.reliability !== "NO_DATA" &&
    input.reliability !== "DEGRADED"
  ) {
    return { due: true, nextProbeAt: null };
  }
  const nextProbeAt = computeNextProbeAt(input.lastAttemptAt, nowMs, env);
  if (!input.lastAttemptAt) {
    return { due: true, nextProbeAt };
  }
  const lastMs = Date.parse(input.lastAttemptAt);
  if (!Number.isFinite(lastMs)) {
    return { due: true, nextProbeAt };
  }
  const due = nowMs >= lastMs + getDegradedProbeIntervalMs(env);
  return { due, nextProbeAt };
}
