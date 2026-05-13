import QRCode from "qrcode";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, "..", "public");
const url = "https://sunhyuk.dev";

const ORANGE = "#ff6b2a";
const TRANSPARENT = "#0000";
const WHITE = "#ffffff";
const BLACK = "#000000";

// 1. Brand SVG: orange modules on transparent — looks good on the dark site
//    AND prints fine on white paper (orange has strong contrast on white).
const brandSvg = await QRCode.toString(url, {
  type: "svg",
  errorCorrectionLevel: "Q",
  margin: 2,
  color: { dark: ORANGE, light: TRANSPARENT },
});
await writeFile(resolve(publicDir, "qr-sunhyuk.svg"), brandSvg, "utf8");

// 2. Print SVG: black on white — universal, max scan reliability.
const printSvg = await QRCode.toString(url, {
  type: "svg",
  errorCorrectionLevel: "Q",
  margin: 4,
  color: { dark: BLACK, light: WHITE },
});
await writeFile(resolve(publicDir, "qr-sunhyuk-print.svg"), printSvg, "utf8");

// 3. PNG (high-res, black on white) for apps that don't accept SVG.
const pngBuffer = await QRCode.toBuffer(url, {
  type: "png",
  errorCorrectionLevel: "Q",
  margin: 4,
  width: 1024,
  color: { dark: BLACK, light: WHITE },
});
await writeFile(resolve(publicDir, "qr-sunhyuk.png"), pngBuffer);

console.log(`Generated QR codes for ${url}`);
console.log("  public/qr-sunhyuk.svg       (orange, transparent — site/dark)");
console.log("  public/qr-sunhyuk-print.svg (black on white — print)");
console.log("  public/qr-sunhyuk.png       (1024px black on white — apps)");
