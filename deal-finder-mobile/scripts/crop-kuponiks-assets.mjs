import sharp from "sharp";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = "C:/Users/hakan/Downloads/WhatsApp Image 2026-08-11 at 14.10.54.jpeg";
const OUT = path.resolve(__dirname, "../assets");

async function main() {
  const meta = await sharp(SRC).metadata();
  console.log("source", meta.width, meta.height, meta.format);

  const w = meta.width;
  const h = meta.height;

  const leftPad = Math.round(w * 0.08);
  const bannerW = Math.round(w * 0.42);
  const bannerTop = Math.round(h * 0.06);
  const bannerH = Math.round(h * 0.88);

  const iconLeft = Math.round(w * 0.58);
  const iconTop = Math.round(h * 0.22);
  const iconSize = Math.round(Math.min(w * 0.34, h * 0.48));

  console.log({ leftPad, bannerW, bannerTop, bannerH, iconLeft, iconTop, iconSize });

  fs.mkdirSync(OUT, { recursive: true });

  const banner = await sharp(SRC)
    .extract({
      left: leftPad,
      top: bannerTop,
      width: bannerW,
      height: bannerH,
    })
    .png()
    .toBuffer();

  await sharp(banner).resize(1080, 1920, { fit: "cover" }).toFile(path.join(OUT, "splash.png"));
  await sharp(banner).resize(1080, 1920, { fit: "cover" }).toFile(path.join(OUT, "onboarding-banner.png"));

  const icon = await sharp(SRC)
    .extract({
      left: iconLeft,
      top: iconTop,
      width: iconSize,
      height: iconSize,
    })
    .png()
    .toBuffer();

  await sharp(icon).resize(1024, 1024, { fit: "cover" }).toFile(path.join(OUT, "icon.png"));
  await sharp(icon).resize(1024, 1024, { fit: "cover" }).toFile(path.join(OUT, "adaptive-icon.png"));
  await sharp(icon).resize(48, 48, { fit: "cover" }).toFile(path.join(OUT, "favicon.png"));

  console.log("ASSETS_OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
