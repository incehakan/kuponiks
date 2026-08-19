/**
 * Honest user-facing source copy. No "güçlü analiz" marketing.
 */

import { listingPlatformLabel } from "../lib/platform-label.js";
import type { MarketSourceShare } from "./market-intelligence.types.js";
import { withPlatformLabels } from "./market-source-diversity.js";

export function joinDisplayLabels(labels: string[]): string {
  const unique = labels.filter(Boolean);
  if (unique.length === 0) {
    return "";
  }
  if (unique.length === 1) {
    return unique[0]!;
  }
  if (unique.length === 2) {
    return `${unique[0]} ve ${unique[1]}`;
  }
  return `${unique.slice(0, -1).join(", ")} ve ${unique[unique.length - 1]}`;
}

export function marketSourceCaption(
  sourceCount: number,
  distribution: MarketSourceShare[],
): string | null {
  if (sourceCount <= 0 || distribution.length === 0) {
    return null;
  }
  const labels = withPlatformLabels(distribution).map((row) => row.platformLabel);
  const joined = joinDisplayLabels(labels);
  if (!joined) {
    return null;
  }
  return `Analiz ${joined} ilanlarından oluşturuldu.`;
}

export function marketSourcePlatformLabel(platform: string): string {
  return listingPlatformLabel(platform) || platform;
}
