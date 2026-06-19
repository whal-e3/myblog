import sharp from "sharp";
import { stat, copyFile, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicAssets = resolve(__dirname, "..", "public", "assets");

const src    = resolve(publicAssets, "starstruck.jpg");
const dst    = resolve(publicAssets, "space-bg.webp");
const backup = resolve(publicAssets, "space-bg.webp.bak");

const srcStat = await stat(src);
console.log(`Source: starstruck.jpg = ${(srcStat.size / 1024 / 1024).toFixed(1)} MB`);

try {
  const oldStat = await stat(dst);
  console.log(`Old space-bg.webp = ${(oldStat.size / 1024).toFixed(0)} KB — backing up to .bak`);
  await copyFile(dst, backup);
} catch (e) {
  console.log("No existing space-bg.webp to back up.");
}

// 2K (2560x1440), cover fit, WebP @ 82 quality.
// `cover` crops to fill — milky way photo will get cropped slightly on the
// edges to fit 16:9. The original is ~3:2, so we lose a bit top/bottom.
await sharp(src)
  .resize(2560, 1440, { fit: "cover", position: "center" })
  .webp({ quality: 82, effort: 6 })
  .toFile(dst);

const newStat = await stat(dst);
console.log(`New space-bg.webp = ${(newStat.size / 1024).toFixed(0)} KB (2K WebP @ 82)`);
console.log(`Compression: ${(srcStat.size / newStat.size).toFixed(1)}x smaller than source`);
