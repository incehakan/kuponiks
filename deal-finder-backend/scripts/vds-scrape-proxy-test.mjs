import { Client } from "ssh2";

const password = process.env.VDS_PASSWORD || "";
if (!password) {
  console.error("VDS_PASSWORD required");
  process.exit(1);
}

const remote = `#!/bin/bash
set -euo pipefail
cd /var/www/deal-finder-backend

echo "==> Enqueue manual scrape jobs (sahibinden, arabam, hepsiemlak)"
node --input-type=module <<'NODE'
import { Queue } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});
const queue = new Queue("scraper-queue", { connection });

const platforms = ["sahibinden", "arabam", "hepsiemlak"];
for (const platform of platforms) {
  const job = await queue.add(
    "scrape-platform",
    {
      platform,
      query: "istanbul",
      city: "istanbul",
      limit: 5,
      triggeredBy: "manual",
    },
    { jobId: "manual-proxy-test-" + platform + "-" + Date.now() },
  );
  console.log("enqueued", platform, job.id);
}

await queue.close();
await connection.quit();
NODE

echo "==> Waiting 180s for scrape attempts..."
sleep 180

echo "==> pm2 logs scraper-worker --lines 120"
pm2 logs scraper-worker --lines 120 --nostream
echo
echo SCRAPE_TEST_DONE
`;

const conn = new Client();
conn
  .on("ready", () => {
    console.log("SSH connected — enqueue scrape test jobs");
    conn.exec(remote, { pty: true }, (err, stream) => {
      if (err) {
        console.error(err);
        process.exit(1);
      }
      stream.on("data", (d) => process.stdout.write(d.toString()));
      stream.stderr.on("data", (d) => process.stderr.write(d.toString()));
      stream.on("close", (code) => {
        conn.end();
        process.exit(code || 0);
      });
    });
  })
  .on("error", (e) => {
    console.error(e);
    process.exit(1);
  })
  .connect({
    host: "45.43.152.58",
    port: 25416,
    username: "root",
    password,
    readyTimeout: 120_000,
  });
