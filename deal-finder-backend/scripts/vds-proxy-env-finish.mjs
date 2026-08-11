import { Client } from "ssh2";

const password = process.env.VDS_PASSWORD || "";
if (!password) {
  console.error("VDS_PASSWORD required");
  process.exit(1);
}

const remote = `#!/bin/bash
set -euo pipefail
APP_DIR=/var/www/deal-finder-backend
ENV_FILE="\$APP_DIR/.env"
cd "\$APP_DIR"

echo "==> HEAD=\$(git rev-parse --short HEAD)"

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
print("DATABASE_URL updated")
PY

set_env() {
  local key="\$1"
  local val="\$2"
  if grep -q "^\${key}=" "\$ENV_FILE"; then
    sed -i "s|^\${key}=.*|\${key}=\\"\${val}\\"|" "\$ENV_FILE"
  else
    echo "\${key}=\\"\${val}\\"" >> "\$ENV_FILE"
  fi
}

set_env PROXY_ENABLED true
set_env PROXY_HOST p.webshare.io
set_env PROXY_PORT 80
set_env PROXY_USER rdlwkhau-tr-rotate
set_env PROXY_PASS 7be9nsr6fab9
set_env PROXY_URL "http://rdlwkhau-tr-rotate:7be9nsr6fab9@p.webshare.io:80"
set_env RESIDENTIAL_PROXY_URL "http://rdlwkhau-tr-rotate:7be9nsr6fab9@p.webshare.io:80"

echo "==> Proxy env (masked):"
grep -E '^(PROXY_|RESIDENTIAL_PROXY_)' "\$ENV_FILE" | sed 's/PROXY_PASS=.*/PROXY_PASS="***"/' | sed 's/:[^@]*@/:***@/g'

echo "==> prisma generate + db push"
npx prisma generate
npx prisma db push --accept-data-loss

echo "==> build"
npm run build

echo "==> pm2 reload"
mkdir -p logs
pm2 delete api-server scraper-worker df-ecosystem 2>/dev/null || true
pm2 start ecosystem.config.cjs --update-env
pm2 save
sleep 5
pm2 status
echo "--- health ---"
curl -sS -m 8 -w "\\nhttp=%{http_code}\\n" http://127.0.0.1:3010/health || true
echo
echo "--- scraper logs (50) ---"
pm2 logs scraper-worker --lines 50 --nostream
echo
echo PROXY_DEPLOY_OK
`;

const conn = new Client();
conn
  .on("ready", () => {
    console.log("SSH connected — fix DB + proxy env + finish deploy");
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
