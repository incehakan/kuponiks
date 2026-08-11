import { Client } from "ssh2";

const password = process.env.VDS_PASSWORD || "";
const appDir = "/var/www/deal-finder-backend";
const telegramToken = process.env.TELEGRAM_BOT_TOKEN || "";
const telegramUsername = process.env.TELEGRAM_BOT_USERNAME || "KuponiksFinder_bot";

if (!password) {
  console.error("VDS_PASSWORD required");
  process.exit(1);
}

if (!telegramToken) {
  console.error("TELEGRAM_BOT_TOKEN required");
  process.exit(1);
}

const remote = `#!/bin/bash
set -euo pipefail
APP_DIR="${appDir}"
ENV_FILE="\$APP_DIR/.env"

if [ ! -f "\$ENV_FILE" ]; then
  echo "ERROR: \$ENV_FILE not found"
  exit 1
fi

cp "\$ENV_FILE" "\${ENV_FILE}.bak.\$(date +%Y%m%d%H%M%S)"

set_env() {
  local key="\$1"
  local val="\$2"
  if grep -q "^\${key}=" "\$ENV_FILE"; then
    sed -i "s|^\${key}=.*|\${key}=\\"\${val}\\"|" "\$ENV_FILE"
  else
    echo "\${key}=\\"\${val}\\"" >> "\$ENV_FILE"
  fi
}

set_env TELEGRAM_BOT_TOKEN "${telegramToken.replace(/"/g, '\\"')}"
set_env TELEGRAM_BOT_USERNAME "${telegramUsername.replace(/"/g, '\\"')}"

echo "==> Updated Telegram env (token masked):"
grep TELEGRAM_BOT_USERNAME "\$ENV_FILE"
grep TELEGRAM_BOT_TOKEN "\$ENV_FILE" | sed 's/:.*/:***MASKED***/'

echo "==> pm2 reload"
cd "\$APP_DIR"
pm2 reload ecosystem.config.cjs --update-env
pm2 save

sleep 2
echo "==> Verify /api/telegram/config"
curl -sS -m 8 https://45.43.152.58.nip.io/api/telegram/config || true
echo
echo ENV_UPDATE_OK
`;

const conn = new Client();
conn
  .on("ready", () => {
    console.log("SSH connected — updating Telegram env + PM2 reload");
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
