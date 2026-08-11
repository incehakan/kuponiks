import { Client } from "ssh2";

const password = process.env.VDS_PASSWORD || "";
const githubToken = process.env.GITHUB_TOKEN || "";
const repoUrl =
  process.env.GIT_REPO_URL ||
  (githubToken
    ? `https://x-access-token:${githubToken}@github.com/incehakan/deal-finder-backend.git`
    : "https://github.com/incehakan/deal-finder-backend.git");
const appDir = "/var/www/deal-finder-backend";

if (!password) {
  console.error("VDS_PASSWORD required");
  process.exit(1);
}

const remote = `#!/bin/bash
set -euo pipefail
APP_DIR="${appDir}"
REPO_URL="${repoUrl.replace(/"/g, '\\"')}"

echo "==> [1/6] Ensure git repo at \$APP_DIR"
mkdir -p /var/www
ENV_BACKUP="/tmp/deal-finder-env-backup"
if [ -f "\$APP_DIR/.env" ]; then
  cp "\$APP_DIR/.env" "\$ENV_BACKUP"
fi
if [ -d "\$APP_DIR/.git" ]; then
  cd "\$APP_DIR"
  git remote set-url origin "\$REPO_URL" || true
  git fetch origin main
  git checkout -B main FETCH_HEAD
else
  rm -rf "\$APP_DIR"
  git clone --branch main "\$REPO_URL" "\$APP_DIR"
  cd "\$APP_DIR"
fi
if [ -f "\$ENV_BACKUP" ]; then
  cp "\$ENV_BACKUP" "\$APP_DIR/.env"
fi
if [ ! -f "\$APP_DIR/.env" ]; then
  JWT_SECRET_VALUE=\$(openssl rand -hex 32)
  cat > "\$APP_DIR/.env" <<EOF
NODE_ENV=production
PROCESS_ROLE=api
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/dealfinder_db?schema=public"
REDIS_URL="redis://localhost:6379"
PORT=3010
JWT_SECRET="\$JWT_SECRET_VALUE"
TELEGRAM_BOT_TOKEN="change-me"
TELEGRAM_BOT_USERNAME="YourDealFinderBot"
WHATSAPP_API_URL="http://localhost:8080/message/sendText/instance"
WHATSAPP_API_KEY="change-me"
FIREBASE_CREDENTIALS_PATH="./firebase-service-account.json"
EXPO_ACCESS_TOKEN=
PROXY_URL=
RESIDENTIAL_PROXY_URL=
SCRAPER_SCHEDULE_INTERVAL_MS=900000
EOF
fi
[ -f "\$APP_DIR/firebase-service-account.json" ] || echo '{}' > "\$APP_DIR/firebase-service-account.json"
echo "HEAD=\$(git rev-parse --short HEAD)"

echo "==> [2/6] npm install"
cd "\$APP_DIR"
npm install

echo "==> [3/6] prisma db push"
npx prisma generate
npx prisma db push --accept-data-loss

echo "==> [4/6] npm run build"
npm run build

echo "==> [5/6] pm2 restart"
cd "\$APP_DIR"
mkdir -p logs
pm2 delete api-server scraper-worker df-ecosystem 2>/dev/null || true
pm2 start ecosystem.config.cjs --update-env
pm2 save

echo "==> [6/6] health check"
sleep 3
pm2 status
echo "---"
curl -sS -m 8 -w "\\nhttp=%{http_code}\\n" http://127.0.0.1:3010/health || true
echo
echo DEPLOY_OK
`;

const conn = new Client();
conn
  .on("ready", () => {
    console.log("SSH connected — deploying backend from GitHub main");
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
