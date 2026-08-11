import { Client } from "ssh2";

const password = process.env.VDS_PASSWORD || "";
if (!password) {
  console.error("VDS_PASSWORD required");
  process.exit(1);
}

const remote = `#!/bin/bash
set -euo pipefail
cd /var/www/deal-finder-backend

NEW_PASS='DealFinderPg2026'
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD '\$NEW_PASS';" >/dev/null

python3 - <<'PY'
from pathlib import Path
import re
path = Path("/var/www/deal-finder-backend/.env")
text = path.read_text()
new_url = 'postgresql://postgres:DealFinderPg2026@localhost:5432/dealfinder_db?schema=public'
text2, n = re.subn(r'^DATABASE_URL=.*$', f'DATABASE_URL="{new_url}"', text, count=1, flags=re.M)
if n == 0:
    text2 = text.rstrip() + f'\\nDATABASE_URL="{new_url}"\\n'
path.write_text(text2)
print("DATABASE_URL ok")
# show proxy keys present
for line in path.read_text().splitlines():
    if line.startswith("PROXY_") or line.startswith("RESIDENTIAL_"):
        if "PASS" in line or "@" in line:
            print(line.split("=")[0] + "=***")
        else:
            print(line)
PY

export PGPASSWORD='DealFinderPg2026'
psql -h 127.0.0.1 -U postgres -d dealfinder_db -c 'SELECT 1 AS ok;'

pm2 reload ecosystem.config.cjs --update-env
sleep 4
pm2 status
curl -sS -m 8 http://127.0.0.1:3010/health || true
echo
pm2 logs scraper-worker --lines 25 --nostream
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
