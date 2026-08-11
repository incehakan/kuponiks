import { Client } from "ssh2";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const host = process.env.VDS_HOST || "45.43.152.58";
const port = Number(process.env.VDS_PORT || "25416");
const username = process.env.VDS_USER || "root";
const password = process.env.VDS_PASSWORD || "";

if (!password) {
  console.error("VDS_PASSWORD required");
  process.exit(1);
}

const nginxConfig = `server {
    listen 80;
    listen [::]:80;
    server_name 45.43.152.58;

    # Deal Finder backend (PM2 api-server on :3010)
    location /api/ {
        proxy_pass http://127.0.0.1:3010;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location /health {
        proxy_pass http://127.0.0.1:3010/health;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
    }
}
`;

const remote = `#!/bin/bash
set -euo pipefail

echo '==> Current nginx deal-finder / related sites'
ls -la /etc/nginx/sites-available/ 2>/dev/null || true
ls -la /etc/nginx/sites-enabled/ 2>/dev/null || true
echo '--- existing deal-finder (if any) ---'
if [ -f /etc/nginx/sites-available/deal-finder ]; then
  cat /etc/nginx/sites-available/deal-finder
else
  echo '(file missing — will create)'
fi

echo '==> Writing /etc/nginx/sites-available/deal-finder'
cat > /etc/nginx/sites-available/deal-finder <<'NGINX_EOF'
${nginxConfig}
NGINX_EOF

mkdir -p /etc/nginx/sites-enabled
ln -sfn /etc/nginx/sites-available/deal-finder /etc/nginx/sites-enabled/deal-finder

echo '==> Final config'
cat /etc/nginx/sites-available/deal-finder

echo '==> nginx -t'
nginx -t

echo '==> reload nginx'
systemctl reload nginx || nginx -s reload

echo '==> verify local upstream'
curl -sS -m 5 -w '\\nupstream_http=%{http_code}\\n' http://127.0.0.1:3010/health || true

echo '==> verify via nginx :80 /health'
curl -sS -m 5 -H 'Host: 45.43.152.58' -w '\\nnginx_http=%{http_code}\\n' http://127.0.0.1/health || true

echo '==> verify via nginx :80 /api/ (expect 404/401 from app, not 502)'
curl -sS -m 5 -o /tmp/df-api-probe.txt -w 'api_http=%{http_code}\\n' -H 'Host: 45.43.152.58' http://127.0.0.1/api/deals || true
head -c 200 /tmp/df-api-probe.txt || true
echo
echo NGINX_OK
`;

const conn = new Client();
conn
  .on("ready", () => {
    console.log(`SSH connected to ${host}:${port}`);
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
