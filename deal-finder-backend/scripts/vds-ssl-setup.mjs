import { Client } from "ssh2";

const password = process.env.VDS_PASSWORD || "";
const domain = "45.43.152.58.nip.io";

if (!password) {
  console.error("VDS_PASSWORD required");
  process.exit(1);
}

const remote = `#!/bin/bash
set -euo pipefail

echo "==> [1/4] Install certbot + python3-certbot-nginx"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y certbot python3-certbot-nginx

echo "==> [2/4] Update Nginx server_name in /etc/nginx/sites-available/deal-finder"
CONF="/etc/nginx/sites-available/deal-finder"
if [ ! -f "\$CONF" ]; then
  echo "ERROR: \$CONF not found"
  exit 1
fi

cp "\$CONF" "\${CONF}.bak.\$(date +%Y%m%d%H%M%S)"

# Add nip.io domain to server_name if not already present
if grep -q "${domain}" "\$CONF"; then
  echo "server_name already contains ${domain}"
else
  sed -i 's/server_name \\(.*\\);/server_name \\1 ${domain};/' "\$CONF"
  echo "Updated server_name:"
  grep server_name "\$CONF"
fi

echo "==> [3/4] nginx -t && reload"
nginx -t
systemctl reload nginx

echo "==> [4/4] Obtain SSL certificate via certbot"
certbot --nginx \\
  -d ${domain} \\
  --non-interactive \\
  --agree-tos \\
  --register-unsafely-without-email \\
  --redirect

echo "==> Verify HTTPS"
sleep 2
curl -sS -m 10 -w "\\nhttps_http=%{http_code}\\n" https://${domain}/health || true
echo
curl -sS -m 10 -w "\\nhttps_api_http=%{http_code}\\n" https://${domain}/api/payment/providers || true
echo
echo SSL_SETUP_OK
`;

const conn = new Client();
conn
  .on("ready", () => {
    console.log("SSH connected — setting up Certbot + HTTPS for", domain);
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
    readyTimeout: 180_000,
  });
