import { Client } from "ssh2";

const password = process.env.VDS_PASSWORD || "";
if (!password) {
  console.error("VDS_PASSWORD required");
  process.exit(1);
}

const remote = `#!/bin/bash
set -euo pipefail

echo '=== maprithm.conf ==='
cat /etc/nginx/sites-available/maprithm.conf
echo
echo '=== default (head) ==='
head -n 80 /etc/nginx/sites-available/default
echo
echo '=== deal-finder ==='
cat /etc/nginx/sites-available/deal-finder
echo
echo '=== enabled ==='
ls -la /etc/nginx/sites-enabled/
echo
echo '=== curl probes ==='
curl -sS -m 5 -o /dev/null -w 'host_ip_/health=%{http_code}\\n' -H 'Host: 45.43.152.58' http://127.0.0.1/health
curl -sS -m 5 -o /dev/null -w 'host_ip_/api/deals=%{http_code}\\n' -H 'Host: 45.43.152.58' http://127.0.0.1/api/deals
curl -sS -m 5 -o /dev/null -w 'nohost_/health=%{http_code}\\n' http://127.0.0.1/health
curl -sS -m 5 -o /dev/null -w 'nohost_/api/deals=%{http_code}\\n' http://127.0.0.1/api/deals
curl -sS -m 5 http://127.0.0.1:3010/health; echo
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
