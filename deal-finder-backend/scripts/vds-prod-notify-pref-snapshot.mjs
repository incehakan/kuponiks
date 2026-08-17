import { readFileSync } from "node:fs";
import { Client } from "ssh2";

const password = process.env.VDS_PASSWORD || "";
if (!password) {
  console.error("VDS_PASSWORD required");
  process.exit(1);
}

const contents = readFileSync(
  new URL("./prod-notify-pref-snapshot.ts", import.meta.url),
  "utf8",
);

const conn = new Client();
conn
  .on("ready", () => {
    conn.sftp((err, sftp) => {
      if (err) {
        console.error(err);
        process.exit(1);
      }
      const remote =
        "/var/www/deal-finder-backend/scripts/prod-notify-pref-snapshot.ts";
      const ws = sftp.createWriteStream(remote, { encoding: "utf8" });
      ws.on("close", () => {
        conn.exec(
          "cd /var/www/deal-finder-backend && npx tsx scripts/prod-notify-pref-snapshot.ts",
          { pty: true },
          (e2, stream) => {
            if (e2) process.exit(1);
            stream.on("data", (d) => process.stdout.write(d.toString()));
            stream.stderr.on("data", (d) => process.stderr.write(d.toString()));
            stream.on("close", (c) => {
              conn.end();
              process.exit(c || 0);
            });
          },
        );
      });
      ws.on("error", (e) => {
        console.error(e);
        process.exit(1);
      });
      ws.end(contents);
    });
  })
  .connect({
    host: process.env.VDS_HOST || "45.43.152.58",
    port: Number(process.env.VDS_PORT || "25416"),
    username: process.env.VDS_USER || "root",
    password,
    readyTimeout: 120_000,
  });
