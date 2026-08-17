/**
 * Dry-run: print query groups for active filters. No scrape, no notify.
 */
import "dotenv/config";
import { runSchedulerCycle } from "../src/scraper/scheduler/scheduler.service.js";
import { prisma } from "../src/lib/prisma.js";

async function main(): Promise<void> {
  const result = await runSchedulerCycle({
    enqueue: false,
    acquireLock: false,
  });
  console.log(
    JSON.stringify(
      {
        activeFilters: result.activeFilters,
        queryGroups: result.queryGroups,
        queuedWouldBe: result.groups.length,
        groups: result.groups.map((group) => ({
          platform: group.platform,
          signature: group.signature,
          displayQuery: group.query,
          appliedCriteria: group.appliedCriteria,
          deferredCriteria: group.deferredCriteria,
          scrapeUrl: group.scrapeUrl,
          city: group.city ?? null,
          filterIds: group.filterIds,
          bestPlan: group.bestPlan,
          intervalMs: group.intervalMs,
          priority: group.priority,
        })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
