import { Client } from "ssh2";

const password = process.env.VDS_PASSWORD || "";
if (!password) {
  console.error("VDS_PASSWORD required");
  process.exit(1);
}

const remote = `#!/bin/bash
set -euo pipefail

echo "==> DATABASE_URL from .env (password masked)"
if [ -f /var/www/deal-finder-backend/.env ]; then
  grep '^DATABASE_URL=' /var/www/deal-finder-backend/.env | sed -E 's#(postgresql://[^:]+:)[^@]+#\\1***#'
  echo
  echo "==> Raw DATABASE_URL parse fields"
  # Extract host, port, db, user (show password separately for admin use)
  python3 - <<'PY'
import re, os
line=open("/var/www/deal-finder-backend/.env").read()
m=re.search(r'^DATABASE_URL="?([^"\\n]+)"?', line, re.M)
if not m:
  print("DATABASE_URL not found")
  raise SystemExit(0)
url=m.group(1)
# postgresql://user:pass@host:port/db?params
mm=re.match(r'postgresql://([^:]+):([^@]+)@([^:/]+):?(\\d+)?/([^?]+)', url)
if mm:
  user, pwd, host, port, db = mm.groups()
  print(f"HOST={host}")
  print(f"PORT={port or '5432'}")
  print(f"DATABASE={db}")
  print(f"USER={user}")
  print(f"PASSWORD={pwd}")
else:
  print("Could not parse:", url)
PY
else
  echo ".env missing"
fi

echo
echo "==> PostgreSQL listen addresses / port"
ss -lntp | grep -E '5432|postgres' || true
grep -E '^listen_addresses|^port' /etc/postgresql/*/main/postgresql.conf 2>/dev/null || true

echo
echo "==> pg_hba.conf (relevant remote lines)"
grep -vE '^#|^$' /etc/postgresql/*/main/pg_hba.conf 2>/dev/null | head -40 || true
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
    readyTimeout: 60_000,
  });
