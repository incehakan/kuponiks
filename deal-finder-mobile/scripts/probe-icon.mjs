import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = "C:/Users/hakan/Downloads/WhatsApp Image 2026-08-11 at 14.10.54.jpeg";
const OUT = path.resolve(__dirname, "../assets");

async function saveCrop(name, region) {
  await sharp(SRC).extract(region).png().toFile(path.join(OUT, name));
  console.log(name, region);
}

async function main() {
  // Wider right-side sweeps
  const candidates = [
    ["_i1.png", { left: 500, top: 200, width: 480, height: 480 }],
    ["_i2.png", { left: 520, top: 400, width: 450, height: 450 }],
    ["_i3.png", { left: 550, top: 500, width: 420, height: 420 }],
    ["_i4.png", { left: 480, top: 150, width: 500, height: 500 }],
    ["_i5.png", { left: 620, top: 450, width: 360, height: 360 }],
    ["_i6.png", { left: 650, top: 550, width: 320, height: 320 }],
    ["_i7.png", { left: 580, top: 600, width: 380, height: 380 }],
    ["_i8.png", { left: 500, top: 700, width: 450, height: 450 }],
  ];
  for (const [name, region] of candidates) {
    await saveCrop(name, region);
  }
}

main().catch(console.error);
