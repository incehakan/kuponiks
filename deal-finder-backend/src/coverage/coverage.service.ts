import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import {
  buildFilterCoverageSnapshot,
  defaultAvailabilityMap,
  evaluateCoverage,
  type AvailabilityMap,
} from "./coverage-engine.js";
import { loadAvailabilityMap } from "./platform-availability.js";
import { loadReliabilityMap } from "./provider-reliability-store.js";
import { buildSearchIntentFromFilter } from "./search-intent-builder.js";
import type { FilterCoverageSnapshot } from "./coverage-types.js";
import type { ReliabilityMap } from "./provider-reliability.js";

export interface CoverageApiPlatform {
  platform: string;
  status: string;
  capability: string;
  availability: string;
  availabilityReason: string;
  reliability: string;
  effectiveStatus: string;
  userStatus: string;
  userLabel: string;
  sourceCriteria: string[];
  matcherCriteria: string[];
  unsupportedCriteria: string[];
}

export interface CoverageApiResponse {
  filterId: string;
  platforms: CoverageApiPlatform[];
  monitoredPlatformCount: number;
  monitoredLabel: string;
  activeSourceCount: number;
  limitedSourceCount: number;
  unavailableSourceCount: number;
  totalSourceCount: number;
  statusLabel: string;
  limitedLabel: string | null;
  unavailableLabel: string | null;
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
      capability: row.coverage,
      availability: row.availability,
      reliability: row.reliability,
      effectiveStatus: row.effectiveStatus,
      userStatus: row.userStatus,
      userLabel: row.userLabel,
      sourceCriteria: row.sourceCriteria,
      matcherCriteria: row.matcherCriteria,
      unsupportedCriteria: row.unsupportedCriteria,
      availabilityReason: toUserAvailabilityReason(
        row.availabilityReason,
        row.availability,
      ),
    })),
    monitoredPlatformCount: snapshot.activeSourceCount,
    monitoredLabel: snapshot.statusLabel,
    activeSourceCount: snapshot.activeSourceCount,
    limitedSourceCount: snapshot.limitedSourceCount,
    unavailableSourceCount: snapshot.unavailableSourceCount,
    totalSourceCount: snapshot.totalSourceCount,
    statusLabel: snapshot.statusLabel,
    limitedLabel: snapshot.limitedLabel,
    unavailableLabel: snapshot.unavailableLabel,
  };
}

export async function evaluateFilterCoverage(
  filterId: string,
  userId: string,
  availability?: AvailabilityMap,
  reliability?: ReliabilityMap,
): Promise<CoverageApiResponse> {
  const filter = await prisma.userFilter.findFirst({
    where: { id: filterId, userId },
  });
  if (!filter) {
    throw new HttpError("Filtre bulunamadı", 404, "NotFoundError");
  }

  const intent = buildSearchIntentFromFilter(filter);
  const runtime =
    availability ??
    (await loadAvailabilityMap().catch(() => defaultAvailabilityMap()));
  const reliabilityMap =
    reliability ?? (await loadReliabilityMap().catch(() => ({})));
  const platforms = evaluateCoverage(intent, runtime);
  const snapshot = buildFilterCoverageSnapshot(
    filter.id,
    intent,
    platforms,
    reliabilityMap,
  );
  return toCoverageApiResponse(snapshot);
}
