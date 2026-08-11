import { Client } from "ssh2";

const password = process.env.VDS_PASSWORD || "";
if (!password) {
  console.error("VDS_PASSWORD required");
  process.exit(1);
}

const remote = `#!/bin/bash
set -euo pipefail

echo "==> DATABASE_URL from .env"
grep '^DATABASE_URL=' /var/www/deal-finder-backend/.env || true

echo
echo "==> Test local auth with password from .env (postgres)"
# Extract password
DB_PASS=\$(python3 - <<'PY'
import re
line=open("/var/www/deal-finder-backend/.env").read()
m=re.search(r'^DATABASE_URL="?postgresql://[^:]+:([^@]+)@', line, re.M)
print(m.group(1) if m else "")
PY
)
echo "Extracted password length: \${#DB_PASS}"

export PGPASSWORD="\$DB_PASS"
if psql -h 127.0.0.1 -U postgres -d dealfinder_db -c 'SELECT current_user, current_database();' 2>&1; then
  echo "LOCAL_AUTH_OK with .env password"
else
  echo "LOCAL_AUTH_FAILED with .env password"
fi

echo
echo "==> Reset postgres password to a known value and update .env"
NEW_PASS='DealFinderPg2026'
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD '\$NEW_PASS';"

# Update DATABASE_URL in .env
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
print("Updated DATABASE_URL in .env")
PY

export PGPASSWORD='DealFinderPg2026'
psql -h 127.0.0.1 -U postgres -d dealfinder_db -c 'SELECT 1 AS ok;'
echo "PASSWORD_RESET_OK"

echo
echo "==> Ensure remote scram/md5 auth allowed"
# already present from earlier inspect; reload just in case
systemctl reload postgresql || true

echo
echo "==> PM2 reload so API uses new DB password"
cd /var/www/deal-finder-backend
pm2 reload ecosystem.config.cjs --update-env
sleep 2
curl -sS -m 8 http://127.0.0.1:3010/health || true
echo
`;

const conn = new Client();
conn
  .on("ready", () => {
    console.log("SSH connected — fixing postgres password");
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
