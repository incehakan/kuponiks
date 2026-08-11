import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = "C:/Users/hakan/Downloads/WhatsApp Image 2026-08-11 at 14.10.54.jpeg";
const OUT = path.resolve(__dirname, "../assets");

async function saveCrop(name, region) {
  await sharp(SRC).extract(region).png().toFile(path.join(OUT, name));
  console.log("saved", name, region);
}

async function main() {
  const meta = await sharp(SRC).metadata();
  console.log(meta.width, meta.height);

  // Probe regions for icon (right side square)
  await saveCrop("_probe_icon_a.png", { left: 520, top: 250, width: 420, height: 420 });
  await saveCrop("_probe_icon_b.png", { left: 560, top: 300, width: 380, height: 380 });
  await saveCrop("_probe_icon_c.png", { left: 600, top: 350, width: 340, height: 340 });
  await saveCrop("_probe_icon_d.png", { left: 540, top: 280, width: 400, height: 400 });

  // Probe banner (left phone)
  await saveCrop("_probe_banner_a.png", { left: 40, top: 40, width: 480, height: 1450 });
  await saveCrop("_probe_banner_b.png", { left: 70, top: 80, width: 420, height: 1380 });
  await saveCrop("_probe_banner_c.png", { left: 100, top: 60, width: 400, height: 1400 });
}

main().catch(console.error);
