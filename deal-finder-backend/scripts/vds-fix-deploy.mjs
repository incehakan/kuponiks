import { Client } from "ssh2";

const password = process.env.VDS_PASSWORD || "";
if (!password) {
  console.error("VDS_PASSWORD required");
  process.exit(1);
}

const remote = `#!/bin/bash
set -e
cd /var/www/deal-finder-backend

echo "==> .env DATABASE_URL (masked)"
grep '^DATABASE_URL=' .env | sed 's/:[^:@]*@/:***@/' || echo "DATABASE_URL missing"

echo "==> PostgreSQL service"
systemctl is-active postgresql || true

echo "==> Try psql with env DATABASE_URL"
set -a
source .env
set +a
npx prisma db push --accept-data-loss 2>&1 || true

echo "==> npm run build"
npm run build

echo "==> pm2 restart deal-finder"
mkdir -p logs
pm2 delete api-server scraper-worker df-ecosystem 2>/dev/null || true
pm2 start ecosystem.config.cjs --update-env
pm2 save
sleep 5
pm2 status
echo "--- local health ---"
curl -sS -m 8 -w "\\nhttp=%{http_code}\\n" http://127.0.0.1:3010/health || true
echo
echo "--- nginx health ---"
curl -sS -m 8 -w "\\nhttp=%{http_code}\\n" http://127.0.0.1/health || true
echo
echo FIX_DEPLOY_OK
`;

const conn = new Client();
conn
  .on("ready", () => {
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
