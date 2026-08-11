import { Client } from "ssh2";

const password = process.env.VDS_PASSWORD || "";
const githubToken = process.env.GITHUB_TOKEN || "";
if (!password) {
  console.error("VDS_PASSWORD required");
  process.exit(1);
}

const repoUrl = githubToken
  ? `https://x-access-token:${githubToken}@github.com/incehakan/deal-finder-backend.git`
  : "https://github.com/incehakan/deal-finder-backend.git";

const remote = `#!/bin/bash
set -euo pipefail
APP_DIR=/var/www/deal-finder-backend
cd "\$APP_DIR"

echo "==> git pull main"
git remote set-url origin "${repoUrl.replace(/"/g, '\\"')}" || true
git fetch origin main
rm -f scripts/dump-marketplace-html.mjs
git checkout -B main FETCH_HEAD
echo "HEAD=\$(git rev-parse --short HEAD)"

# Keep DB password stable
NEW_PASS='DealFinderPg2026'
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD '\$NEW_PASS';" >/dev/null || true
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
PY

echo "==> npm install + build"
npm install
npx prisma generate
npx tsc
# fallback if package script fails
test -f dist/scraper/parsers/arabam.parser.js

echo "==> pm2 reload scraper-worker (+ api)"
mkdir -p logs tmp/html-dumps
pm2 reload ecosystem.config.cjs --update-env || {
  pm2 delete api-server scraper-worker 2>/dev/null || true
  pm2 start ecosystem.config.cjs --update-env
}
pm2 save
sleep 4
pm2 status
pm2 logs scraper-worker --lines 30 --nostream
echo PARSER_DEPLOY_OK
`;

const conn = new Client();
conn
  .on("ready", () => {
    console.log("SSH connected — deploy parser fix");
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
