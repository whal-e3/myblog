import sharp from "sharp";
import { mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = resolve(__dirname, "..", "..", "7th_cubesat_competition_poster.jpg");
const outDir = resolve(
  __dirname,
  "..",
  "public",
  "assets",
  "content",
  "project",
  "xxxx_sat",
);
await mkdir(outDir, { recursive: true });

// 1. Optimized full poster (for use inside the project body if wanted).
//    Resize 3543×4961 → 1200×~1680, WebP @ 82.
await sharp(src)
  .resize({ width: 1200 })
  .webp({ quality: 82 })
  .toFile(resolve(outDir, "poster.webp"));

// 2. Landscape COVER for the project card (16:7).
//    The poster is portrait, so we letterbox it on a dark navy background
//    matching the site's bg-deep. Poster scaled to fit the canvas height,
//    centered horizontally.
const COVER_W = 1600;
const COVER_H = 700;
const POSTER_H = 640; // leave a small top/bottom margin
const POSTER_W = Math.round(POSTER_H * (3543 / 4961));

const posterBuf = await sharp(src)
  .resize({ height: POSTER_H, fit: "inside" })
  .toBuffer();

await sharp({
  create: {
    width: COVER_W,
    height: COVER_H,
    channels: 3,
    background: { r: 5, g: 3, b: 8 }, // matches --bg-deep
  },
})
  .composite([{ input: posterBuf, gravity: "center" }])
  .webp({ quality: 85 })
  .toFile(resolve(outDir, "cover.webp"));

for (const f of ["poster.webp", "cover.webp"]) {
  const s = await stat(resolve(outDir, f));
  console.log(`  ${f}  ${(s.size / 1024).toFixed(0)} KB`);
}
console.log(`→ ${outDir}`);
