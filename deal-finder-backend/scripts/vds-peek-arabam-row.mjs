import { Client } from "ssh2";

const password = process.env.VDS_PASSWORD || "";
if (!password) {
  console.error("VDS_PASSWORD required");
  process.exit(1);
}

const remote = `#!/bin/bash
python3 - <<'PY'
from pathlib import Path
import re
html = Path('/var/www/deal-finder-backend/tmp/html-dumps/arabam.html').read_text(encoding='utf-8', errors='ignore')
# Extract first listing-list-item row (approx)
m = re.search(r'<tr[^>]*class="[^"]*listing-list-item[^"]*"[^>]*>.*?</tr>', html, re.I|re.S)
print('ROW_FOUND' if m else 'ROW_NOT_FOUND')
if m:
    row = m.group(0)
    print('ROW_LEN', len(row))
    print(row[:6000])
# Class tokens around listing-price
for cls in ['listing-price','listing-modelname','listing-text','listing-city','photo','img']:
    print(cls, html.count(cls))
# img src near ilan
imgs = re.findall(r'<img[^>]+src="([^"]+)"[^>]*>', html)
print('IMG_COUNT', len(imgs))
print('IMG_SAMPLE', imgs[:5])
PY
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
      stream.on("close", (code) => {
        conn.end();
        process.exit(code || 0);
      });
    });
  })
  .connect({
    host: "45.43.152.58",
    port: 25416,
    username: "root",
    password,
    readyTimeout: 60_000,
  });
