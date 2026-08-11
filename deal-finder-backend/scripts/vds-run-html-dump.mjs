import { Client } from "ssh2";
import { readFileSync } from "node:fs";

const password = process.env.VDS_PASSWORD || "";
if (!password) {
  console.error("VDS_PASSWORD required");
  process.exit(1);
}

const localScript = readFileSync(
  new URL("./dump-marketplace-html.mjs", import.meta.url),
  "utf8",
);

const conn = new Client();
conn
  .on("ready", () => {
    console.log("SSH connected — uploading dump script");
    conn.sftp((err, sftp) => {
      if (err) {
        console.error(err);
        process.exit(1);
      }
      const remotePath = "/var/www/deal-finder-backend/scripts/dump-marketplace-html.mjs";
      const ws = sftp.createWriteStream(remotePath);
      ws.on("close", () => {
        console.log("Uploaded. Running dump...");
        const cmd = `cd /var/www/deal-finder-backend && mkdir -p scripts tmp/html-dumps && node scripts/dump-marketplace-html.mjs 2>&1 | tee /tmp/html-dump-run.log | tail -n 120`;
        conn.exec(cmd, { pty: true }, (e2, stream) => {
          if (e2) {
            console.error(e2);
            process.exit(1);
          }
          stream.on("data", (d) => process.stdout.write(d.toString()));
          stream.stderr.on("data", (d) => process.stderr.write(d.toString()));
          stream.on("close", (code) => {
            // Pull reports
            conn.exec(
              `echo '==== ARABAM REPORT ===='; cat /var/www/deal-finder-backend/tmp/html-dumps/arabam-report.json 2>/dev/null | head -c 12000; echo; echo '==== HEPSIEMLAK REPORT ===='; cat /var/www/deal-finder-backend/tmp/html-dumps/hepsiemlak-report.json 2>/dev/null | head -c 12000`,
              { pty: true },
              (e3, stream2) => {
                if (e3) {
                  console.error(e3);
                  conn.end();
                  process.exit(1);
                }
                stream2.on("data", (d) => process.stdout.write(d.toString()));
                stream2.on("close", () => {
                  conn.end();
                  process.exit(code || 0);
                });
              },
            );
          });
        });
      });
      ws.on("error", (e) => {
        console.error(e);
        process.exit(1);
      });
      ws.end(localScript);
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
