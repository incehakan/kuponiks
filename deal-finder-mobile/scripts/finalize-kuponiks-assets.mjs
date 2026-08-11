import sharp from "sharp";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = "C:/Users/hakan/Downloads/WhatsApp Image 2026-08-11 at 14.10.54.jpeg";
const OUT = path.resolve(__dirname, "../assets");

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  // Left vertical onboarding / splash phone art
  const bannerBuf = await sharp(SRC)
    .extract({ left: 40, top: 40, width: 480, height: 1450 })
    .png()
    .toBuffer();

  await sharp(bannerBuf)
    .resize(1080, 1920, { fit: "cover", position: "top" })
    .toFile(path.join(OUT, "splash.png"));

  await sharp(bannerBuf)
    .resize(1080, 1920, { fit: "cover", position: "top" })
    .toFile(path.join(OUT, "onboarding-banner.png"));

  // Right app icon (K + lightning), trim white padding
  const iconBuf = await sharp(SRC)
    .extract({ left: 650, top: 760, width: 300, height: 300 })
    .trim({ threshold: 20 })
    .png()
    .toBuffer();

  const iconMeta = await sharp(iconBuf).metadata();
  const pad = Math.round(Math.max(iconMeta.width, iconMeta.height) * 0.06);
  const side = Math.max(iconMeta.width, iconMeta.height) + pad * 2;

  const squared = await sharp({
    create: {
      width: side,
      height: side,
      channels: 4,
      background: { r: 18, g: 2, b: 43, alpha: 1 }, // #12022b
    },
  })
    .composite([
      {
        input: iconBuf,
        gravity: "centre",
      },
    ])
    .png()
    .toBuffer();

  await sharp(squared).resize(1024, 1024).toFile(path.join(OUT, "icon.png"));
  await sharp(squared).resize(1024, 1024).toFile(path.join(OUT, "adaptive-icon.png"));
  await sharp(squared).resize(48, 48).toFile(path.join(OUT, "favicon.png"));

  // cleanup probes
  for (const f of fs.readdirSync(OUT)) {
    if (f.startsWith("_")) {
      fs.unlinkSync(path.join(OUT, f));
    }
  }

  console.log("FINAL_ASSETS_OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
