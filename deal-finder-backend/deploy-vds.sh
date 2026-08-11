#!/usr/bin/env bash
# =============================================================================
# Deal Finder Backend — VDS (Ubuntu 22.04) deployment via SSH
# =============================================================================
# Usage (never commit real passwords):
#   export VDS_PASSWORD='your-root-password'
#   export GIT_REPO_URL='https://github.com/ORG/deal-finder-backend.git'  # optional
#   bash deploy-vds.sh
#
# Required tools on the runner: ssh, scp (and sshpass OR SSH key auth).
# On Ubuntu/Debian runners: sudo apt-get install -y sshpass
# =============================================================================
set -euo pipefail

VDS_HOST="${VDS_HOST:-45.43.152.58}"
VDS_PORT="${VDS_PORT:-25416}"
VDS_USER="${VDS_USER:-root}"
VDS_PASSWORD="${VDS_PASSWORD:-}"
APP_DIR="${APP_DIR:-/var/www/deal-finder-backend}"
GIT_REPO_URL="${GIT_REPO_URL:-}"
DB_NAME="${DB_NAME:-dealfinder_db}"
DB_USER="${DB_USER:-postgres}"
DB_PASS="${DB_PASS:-postgres}"

if [[ -z "${VDS_PASSWORD}" ]]; then
  echo "ERROR: Set VDS_PASSWORD in the environment before running this script."
  echo "  export VDS_PASSWORD='***'"
  exit 1
fi

SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o PreferredAuthentications=password -o PubkeyAuthentication=no -p "${VDS_PORT}")

remote() {
  if command -v sshpass >/dev/null 2>&1; then
    sshpass -p "${VDS_PASSWORD}" ssh "${SSH_OPTS[@]}" "${VDS_USER}@${VDS_HOST}" "$@"
  else
    echo "ERROR: sshpass is required for password auth. Install it or use SSH keys."
    exit 1
  fi
}

echo "==> Connecting to ${VDS_USER}@${VDS_HOST}:${VDS_PORT}"

remote bash -s <<REMOTE
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
APP_DIR="${APP_DIR}"
DB_NAME="${DB_NAME}"
DB_USER="${DB_USER}"
DB_PASS="${DB_PASS}"
GIT_REPO_URL="${GIT_REPO_URL}"

echo "==> [1/6] System packages (Node 20, PostgreSQL, PM2, Chromium deps)"
apt-get update -y
apt-get install -y \\
  ca-certificates curl gnupg git build-essential \\
  postgresql postgresql-contrib \\
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \\
  libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \\
  libgbm1 libasound2 libpango-1.0-0 libcairo2 libx11-xcb1 \\
  fonts-liberation xdg-utils wget unzip

if ! command -v node >/dev/null 2>&1 || [[ "\$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

npm install -g pm2

echo "==> [2/6] PostgreSQL database \${DB_NAME}"
systemctl enable --now postgresql
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='\${DB_NAME}'" | grep -q 1 \\
  || sudo -u postgres psql -c "CREATE DATABASE \${DB_NAME};"
# Ensure local postgres role can connect with password auth for app DATABASE_URL
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD '\${DB_PASS}';" || true

echo "==> [3/6] App directory \${APP_DIR}"
mkdir -p /var/www
if [[ -n "\${GIT_REPO_URL}" ]]; then
  if [[ -d "\${APP_DIR}/.git" ]]; then
    cd "\${APP_DIR}"
    git fetch --all
    git reset --hard origin/main || git reset --hard origin/master
  else
    rm -rf "\${APP_DIR}"
    git clone "\${GIT_REPO_URL}" "\${APP_DIR}"
  fi
else
  mkdir -p "\${APP_DIR}"
  echo "GIT_REPO_URL empty — expecting code already present or uploaded separately."
fi

cd "\${APP_DIR}"

echo "==> [4/6] Production .env"
JWT_SECRET_VALUE="\$(openssl rand -hex 32)"
cat > .env <<EOF
NODE_ENV=production
PROCESS_ROLE=api
DATABASE_URL="postgresql://\${DB_USER}:\${DB_PASS}@localhost:5432/\${DB_NAME}?schema=public"
REDIS_URL="redis://localhost:6379"
PORT=3010
JWT_SECRET="\${JWT_SECRET_VALUE}"
TELEGRAM_BOT_TOKEN="change-me"
WHATSAPP_API_URL="http://localhost:8080/message/sendText/instance"
WHATSAPP_API_KEY="change-me"
FIREBASE_CREDENTIALS_PATH="./firebase-service-account.json"
EXPO_ACCESS_TOKEN=
PROXY_URL=
RESIDENTIAL_PROXY_URL=
SCRAPER_SCHEDULE_INTERVAL_MS=900000
EOF

# Redis (BullMQ) — install if missing
if ! command -v redis-server >/dev/null 2>&1; then
  apt-get install -y redis-server
  systemctl enable --now redis-server
fi

# Placeholder Firebase file so env validation can boot (replace with real SA in prod)
if [[ ! -f firebase-service-account.json ]]; then
  echo '{}' > firebase-service-account.json
fi

echo "==> [5/6] npm install / prisma / build"
npm install
npx prisma generate
npx prisma db push --accept-data-loss
npm run build

echo "==> [6/6] PM2 start"
mkdir -p logs
pm2 update || true
# Only touch Deal Finder processes — never `pm2 delete all` on shared VDS hosts.
pm2 delete api-server scraper-worker || true
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd -u root --hp /root | tail -n 1 | bash || true
pm2 status

echo "==> Deployment finished on \$(hostname)"
curl -sS -o /dev/null -w "health_http=%{http_code}\\n" http://127.0.0.1:3000/health || true
REMOTE

echo "==> deploy-vds.sh completed"
