/**
 * Windows-friendly VDS deploy runner (password SSH via ssh2).
 *
 * Usage (PowerShell):
 *   $env:VDS_PASSWORD = '***'
 *   node scripts/deploy-vds.mjs
 *
 * Optional:
 *   $env:GIT_REPO_URL = 'https://github.com/ORG/deal-finder-backend.git'
 *   (when set, server clones instead of uploading a local archive)
 */
import { Client } from "ssh2";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { join, relative, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const host = process.env.VDS_HOST || "45.43.152.58";
const port = Number(process.env.VDS_PORT || "25416");
const username = process.env.VDS_USER || "root";
const password = process.env.VDS_PASSWORD || "";
const appDir = process.env.APP_DIR || "/var/www/deal-finder-backend";
const gitRepoUrl = (process.env.GIT_REPO_URL || "").trim();

if (!password) {
  console.error("Set VDS_PASSWORD before running.");
  process.exit(1);
}

function sshExec(conn, command, label) {
  return new Promise((resolve, reject) => {
    console.log(`\n==== ${label} ====`);
    conn.exec(command, { pty: true }, (err, stream) => {
      if (err) return reject(err);
      let stdout = "";
      stream.on("data", (d) => {
        const s = d.toString();
        stdout += s;
        process.stdout.write(s);
      });
      stream.stderr.on("data", (d) => process.stderr.write(d.toString()));
      stream.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`${label} failed with exit ${code}`));
          return;
        }
        resolve({ stdout, code });
      });
    });
  });
}

function buildTarArchive() {
  const tarPath = join(tmpdir(), `deal-finder-backend-${Date.now()}.tar.gz`);
  const excludeArgs = [
    "--exclude=node_modules",
    "--exclude=dist",
    "--exclude=.git",
    "--exclude=.browser-data",
    "--exclude=logs",
    "--exclude=.env",
  ];
  // Windows 10+ ships bsdtar; forces forward-slash paths for Linux extract.
  execFileSync(
    "tar",
    ["-czf", tarPath, ...excludeArgs, "-C", ROOT, "."],
    { stdio: "inherit" },
  );
  if (!existsSync(tarPath)) {
    throw new Error("Failed to create tar.gz archive");
  }
  return tarPath;
}

function sftpUpload(conn, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      const rs = createReadStream(localPath);
      const ws = sftp.createWriteStream(remotePath);
      ws.on("close", resolve);
      ws.on("error", reject);
      rs.on("error", reject);
      rs.pipe(ws);
    });
  });
}

function buildRemoteScript(useGitClone) {
  const cloneBlock = useGitClone
    ? `
if [ -d "$APP_DIR/.git" ]; then
  cd "$APP_DIR"
  git fetch --all
  git reset --hard origin/main 2>/dev/null || git reset --hard origin/master
else
  rm -rf "$APP_DIR"
  git clone "$GIT_REPO_URL" "$APP_DIR"
fi
`
    : `
mkdir -p "$APP_DIR"
if [ -f /tmp/deal-finder-backend.tar.gz ]; then
  rm -rf "$APP_DIR"
  mkdir -p "$APP_DIR"
  tar -xzf /tmp/deal-finder-backend.tar.gz -C "$APP_DIR"
  rm -f /tmp/deal-finder-backend.tar.gz
fi
`;

  return `#!/bin/bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
APP_DIR='${appDir}'
DB_NAME='dealfinder_db'
DB_USER='postgres'
DB_PASS='postgres'
GIT_REPO_URL='${gitRepoUrl.replace(/'/g, `'\"'\"'`)}'

echo '==> [1/6] System packages (Node 20, PostgreSQL, Redis, PM2, Chromium deps)'
apt-get update -y
apt-get install -y ca-certificates curl gnupg git build-essential \\
  postgresql postgresql-contrib redis-server unzip \\
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \\
  libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \\
  libgbm1 libpango-1.0-0 libcairo2 libx11-xcb1 fonts-liberation xdg-utils wget || true
apt-get install -y libasound2t64 2>/dev/null || apt-get install -y libasound2 || true

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
else
  MAJOR=$(node -v | cut -d. -f1 | tr -d v)
  if [ "$MAJOR" -lt 20 ]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  fi
fi
npm install -g pm2

echo '==> [2/6] PostgreSQL + Redis'
systemctl enable --now postgresql
systemctl enable --now redis-server || systemctl enable --now redis || true
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 \\
  || sudo -u postgres psql -c "CREATE DATABASE $DB_NAME;"
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD '$DB_PASS';" || true

echo '==> [3/6] App directory'
mkdir -p /var/www
${cloneBlock}
cd "$APP_DIR"
ls -la | head -n 30

echo '==> [4/6] Production .env'
JWT_SECRET_VALUE=$(openssl rand -hex 32)
cat > .env <<EOF
NODE_ENV=production
PROCESS_ROLE=api
DATABASE_URL="postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME?schema=public"
REDIS_URL="redis://localhost:6379"
PORT=3010
JWT_SECRET="$JWT_SECRET_VALUE"
TELEGRAM_BOT_TOKEN="change-me"
WHATSAPP_API_URL="http://localhost:8080/message/sendText/instance"
WHATSAPP_API_KEY="change-me"
FIREBASE_CREDENTIALS_PATH="./firebase-service-account.json"
EXPO_ACCESS_TOKEN=
PROXY_URL=
RESIDENTIAL_PROXY_URL=
SCRAPER_SCHEDULE_INTERVAL_MS=900000
EOF
[ -f firebase-service-account.json ] || echo '{}' > firebase-service-account.json

echo '==> [5/6] npm install / prisma / build'
npm install
npx prisma generate
npx prisma db push --accept-data-loss
npm run build

echo '==> [6/6] PM2'
mkdir -p logs
pm2 update || true
# Restore any previously saved processes (shared VDS safety), then start ours.
pm2 resurrect || true
# Only touch Deal Finder processes — never \`pm2 delete all\` on shared hosts.
pm2 delete api-server scraper-worker || true
pm2 start ecosystem.config.cjs
pm2 save
STARTUP_CMD=$(pm2 startup systemd -u root --hp /root | tail -n 1)
eval "$STARTUP_CMD" || true
pm2 status
echo '--- health ---'
sleep 2
curl -sS -m 8 http://127.0.0.1:3010/health || true
echo
echo DEPLOY_OK
node -v
pm2 jlist | head -c 4000 || true
`;
}

async function main() {
  console.log(`Connecting to ${username}@${host}:${port} ...`);
  const conn = new Client();
  await new Promise((resolve, reject) => {
    conn
      .on("ready", resolve)
      .on("error", reject)
      .connect({
        host,
        port,
        username,
        password,
        readyTimeout: 90_000,
        tryKeyboard: true,
      });
  });
  console.log("SSH connected.");

  if (!gitRepoUrl) {
    const tarPath = buildTarArchive();
    console.log(`Uploading archive ${tarPath} ...`);
    await sftpUpload(conn, tarPath, "/tmp/deal-finder-backend.tar.gz");
    try {
      unlinkSync(tarPath);
    } catch {
      // ignore
    }
  }

  const scriptPath = "/tmp/deal-finder-deploy.sh";
  const remoteScript = buildRemoteScript(Boolean(gitRepoUrl));
  await new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.writeFile(scriptPath, remoteScript, { mode: 0o755 }, (e) =>
        e ? reject(e) : resolve(),
      );
    });
  });

  await sshExec(conn, `bash ${scriptPath}`, "remote-deploy");
  conn.end();
  console.log("\nVDS deployment finished successfully.");
}

main().catch((err) => {
  console.error("\nDEPLOY FAILED:", err?.message || err);
  process.exit(1);
});
