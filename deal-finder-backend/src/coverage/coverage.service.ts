import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import {
  buildFilterCoverageSnapshot,
  defaultAvailabilityMap,
  evaluateCoverage,
  type AvailabilityMap,
} from "./coverage-engine.js";
import { loadAvailabilityMap } from "./platform-availability.js";
import { buildSearchIntentFromFilter } from "./search-intent-builder.js";
import type { FilterCoverageSnapshot } from "./coverage-types.js";

export interface CoverageApiPlatform {
  platform: string;
  status: string;
  availability: string;
  availabilityReason: string;
  userStatus: string;
  sourceCriteria: string[];
  matcherCriteria: string[];
  unsupportedCriteria: string[];
}

export interface CoverageApiResponse {
  filterId: string;
  platforms: CoverageApiPlatform[];
  monitoredPlatformCount: number;
  monitoredLabel: string;
}

function toUserAvailabilityReason(
  reason: string,
  availability: string,
): string {
  if (availability !== "UNAVAILABLE") {
    return availability === "DEGRADED" ? "limited" : "none";
  }
  if (reason === "cloudflare" || reason === "circuit_open") {
    return "temporarily_unavailable";
  }
  return "temporarily_unavailable";
}

export function toCoverageApiResponse(
  snapshot: FilterCoverageSnapshot,
): CoverageApiResponse {
  return {
    filterId: snapshot.filterId,
    platforms: snapshot.platforms.map((row) => ({
      platform: row.platform,
      status: row.coverage,
      availability: row.availability,
      userStatus: row.userStatus,
      sourceCriteria: row.sourceCriteria,
      matcherCriteria: row.matcherCriteria,
      unsupportedCriteria: row.unsupportedCriteria,
      availabilityReason: toUserAvailabilityReason(
        row.availabilityReason,
        row.availability,
      ),
    })),
    monitoredPlatformCount: snapshot.monitoredPlatformCount,
    monitoredLabel: snapshot.monitoredLabel,
  };
}

export async function evaluateFilterCoverage(
  filterId: string,
  userId: string,
  availability?: AvailabilityMap,
): Promise<CoverageApiResponse> {
  const filter = await prisma.userFilter.findFirst({
    where: { id: filterId, userId },
  });
  if (!filter) {
    throw new HttpError("Filtre bulunamadı", 404, "NotFoundError");
  }

  const intent = buildSearchIntentFromFilter(filter);
  const runtime = availability ?? (await loadAvailabilityMap().catch(() => defaultAvailabilityMap()));
  const platforms = evaluateCoverage(intent, runtime);
  const snapshot = buildFilterCoverageSnapshot(filter.id, intent, platforms);
  return toCoverageApiResponse(snapshot);
}
