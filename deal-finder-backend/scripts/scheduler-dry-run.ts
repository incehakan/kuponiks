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
          key: group.key,
          platform: group.platform,
          query: group.query,
          city: group.city ?? "all",
          filterIds: group.filterIds,
          bestPlan: group.bestPlan,
          intervalMs: group.intervalMs,
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
