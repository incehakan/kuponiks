/**
 * Single scheduler cycle: enqueue grouped scrape jobs. No catch-up flood.
 * Does not send notifications by itself; ingest create-path still applies.
 */
import "dotenv/config";
import { runSchedulerCycle } from "../src/scraper/scheduler/scheduler.service.js";
import { prisma } from "../src/lib/prisma.js";

async function main(): Promise<void> {
  const result = await runSchedulerCycle({
    enqueue: true,
    acquireLock: true,
  });
  console.log(
    JSON.stringify(
      {
        skipped: result.skipped,
        skipReason: result.skipReason,
        activeFilters: result.activeFilters,
        queryGroups: result.queryGroups,
        queued: result.queued,
        dedupSkipped: result.dedupSkipped,
        circuitSkipped: result.circuitSkipped,
        platforms: result.platforms,
        durationMs: result.durationMs,
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
