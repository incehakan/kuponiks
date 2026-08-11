import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = "C:/Users/hakan/Downloads/WhatsApp Image 2026-08-11 at 14.10.54.jpeg";
const OUT = path.resolve(__dirname, "../assets");

async function save(name, region) {
  await sharp(SRC).extract(region).png().toFile(path.join(OUT, name));
  console.log(name, region);
}

async function main() {
  // Fine-tune icon around the good _i8 area (500,700,450,450)
  await save("_icon_fine1.png", { left: 620, top: 740, width: 320, height: 320 });
  await save("_icon_fine2.png", { left: 650, top: 760, width: 300, height: 300 });
  await save("_icon_fine3.png", { left: 680, top: 780, width: 280, height: 280 });
  await save("_icon_fine4.png", { left: 600, top: 720, width: 340, height: 340 });
  await save("_icon_fine5.png", { left: 640, top: 750, width: 310, height: 310 });
}

main().catch(console.error);
