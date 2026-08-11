import { Client } from "ssh2";

const password = process.env.VDS_PASSWORD || "";
if (!password) {
  console.error("VDS_PASSWORD required");
  process.exit(1);
}

const remote = `#!/bin/bash
set -e
cd /var/www/deal-finder-backend

echo "==> Reset postgres password for dealfinder_db access"
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'postgres';" 2>/dev/null || true

echo "==> prisma db push"
set -a
source .env
set +a
npx prisma db push --accept-data-loss

echo "==> verify notifyTelegram default in DB"
sudo -u postgres psql -d dealfinder_db -c "SELECT column_name, column_default FROM information_schema.columns WHERE table_name='UserFilter' AND column_name='notifyTelegram';"

echo DB_PUSH_OK
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
    readyTimeout: 120_000,
  });
