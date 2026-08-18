#!/usr/bin/env tsx
/** Read-only provider reliability status — no scrape, no notifications. */
import "dotenv/config";
import { buildProviderStatusReport } from "../src/coverage/provider-reliability-report.js";

async function main(): Promise<void> {
  const rows = await buildProviderStatusReport();
  console.log(JSON.stringify({ providers: rows }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
