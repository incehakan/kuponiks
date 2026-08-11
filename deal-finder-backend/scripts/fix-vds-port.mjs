import { Client } from "ssh2";

const host = process.env.VDS_HOST || "45.43.152.58";
const port = Number(process.env.VDS_PORT || "25416");
const username = process.env.VDS_USER || "root";
const password = process.env.VDS_PASSWORD || "";

if (!password) {
  console.error("VDS_PASSWORD required");
  process.exit(1);
}

const remote = `#!/bin/bash
set -euo pipefail
cd /var/www/deal-finder-backend

sed -i 's/^PORT=.*/PORT=3010/' .env

# Remove mistaken df-ecosystem process + any prior deal-finder apps
pm2 delete df-ecosystem api-server scraper-worker || true

# Start apps explicitly (avoids PM2 mis-parsing ecosystem as a script)
pm2 start dist/server.js \\
  --name api-server \\
  --cwd /var/www/deal-finder-backend \\
  --time \\
  --max-memory-restart 512M \\
  --env NODE_ENV=production \\
  --update-env
pm2 set api-server:NODE_ENV production || true

# Inject env via ecosystem file with correct \`pm2 start ...\` from app dir
cat > ecosystem.config.cjs <<'EOF'
module.exports = {
  apps: [
    {
      name: "api-server",
      cwd: "/var/www/deal-finder-backend",
      script: "dist/server.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PROCESS_ROLE: "api",
        PORT: 3010,
      },
      error_file: "./logs/api-server-error.log",
      out_file: "./logs/api-server-out.log",
      merge_logs: true,
      time: true,
    },
    {
      name: "scraper-worker",
      cwd: "/var/www/deal-finder-backend",
      script: "dist/scraper/worker.main.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PROCESS_ROLE: "worker",
      },
      error_file: "./logs/scraper-worker-error.log",
      out_file: "./logs/scraper-worker-out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
EOF

pm2 delete api-server scraper-worker df-ecosystem || true
# Critical: run from project dir so PM2 loads as ecosystem config
cd /var/www/deal-finder-backend
pm2 start ecosystem.config.cjs
pm2 save
sleep 5
pm2 status
echo '--- listeners ---'
ss -lptn | grep -E ':3010|:3000' || true
echo '--- health ---'
curl -sS -m 8 -w '\\nhttp=%{http_code}\\n' http://127.0.0.1:3010/health || true
echo
echo '--- logs ---'
pm2 logs api-server --lines 50 --nostream || true
echo START_OK
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
  .connect({ host, port, username, password, readyTimeout: 60_000 });
