import { Client } from "ssh2";

const password = process.env.VDS_PASSWORD || "";
if (!password) {
  console.error("VDS_PASSWORD required");
  process.exit(1);
}

const remote = [
  "#!/bin/bash",
  "set -euo pipefail",
  "APP_DIR=/var/www/deal-finder-backend",
  "NEW_PASS='DealFinderPg2026'",
  'echo "==> HEAD=$(cd $APP_DIR && git rev-parse --short HEAD)"',
  'echo "==> Ensure postgres password + .env DATABASE_URL"',
  'sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD \'$NEW_PASS\';" >/dev/null',
  "python3 -c \"from pathlib import Path; import re; p=Path('/var/www/deal-finder-backend/.env'); t=p.read_text() if p.exists() else ''; u='postgresql://postgres:DealFinderPg2026@localhost:5432/dealfinder_db?schema=public'; t2,n=re.subn(r'^DATABASE_URL=.*$', 'DATABASE_URL=\\\"'+u+'\\\"', t, count=1, flags=re.M); p.write_text(t2 if n else t.rstrip()+'\\nDATABASE_URL=\\\"'+u+'\\\"\\n'); print('DATABASE_URL updated')\"",
  'export PGPASSWORD="$NEW_PASS"',
  "psql -h 127.0.0.1 -U postgres -d dealfinder_db -c 'SELECT 1 AS ok;' >/dev/null",
  'echo "DB_AUTH_OK"',
  'cd "$APP_DIR"',
  'echo "==> prisma generate"',
  "npx prisma generate",
  'echo "==> npm run build"',
  "npm run build",
  'echo "==> pm2 restart"',
  "mkdir -p logs",
  "pm2 delete api-server scraper-worker df-ecosystem 2>/dev/null || true",
  "pm2 start ecosystem.config.cjs --update-env",
  "pm2 save",
  "sleep 3",
  "pm2 status",
  'echo "---"',
  'curl -sS -m 8 -w "\\nhttp=%{http_code}\\n" http://127.0.0.1:3010/health || true',
  'curl -sS -m 8 -w "\\nhttps_http=%{http_code}\\n" https://45.43.152.58.nip.io/health || true',
  "echo",
  "echo DEPLOY_OK",
].join("\n");

const conn = new Client();
conn
  .on("ready", () => {
    console.log("SSH connected — fix DB password and finish deploy");
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
    readyTimeout: 180_000,
  });
