/**
 * Produces public/miocoin-icon.png — a small web copy of the ORIGINAL MioCoin
 * artwork (src/assets/miocoin.png) for the Shoptet listing badge.
 *
 * The source is 1024x1024 / ~1.7 MB with the coin sitting on an opaque grey
 * backdrop, which is unusable as a 16-18px icon on a white product card. This
 * script only:
 *   1. finds the coin's bounding box (pixels differing from the corner backdrop),
 *   2. crops to it,
 *   3. applies a circular alpha mask — the coin is round, so the mask follows its
 *      own edge and removes only the incidental grey backdrop,
 *   4. downscales to 48x48 (crisp at the 16-18px display size, retina included).
 *
 * No recolouring, no redrawing, no new symbol — the coin itself is untouched.
 * Re-run with: node scripts/make-miocoin-icon.mjs
 */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve('src/assets/miocoin.png');
const OUT = resolve('public/miocoin-icon.png');
const SIZE = 48;

const dataUrl = 'data:image/png;base64,' + readFileSync(SRC).toString('base64');

const browser = await chromium.launch();
const page = await browser.newPage();

const result = await page.evaluate(async ({ dataUrl, SIZE }) => {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();

  const w = img.naturalWidth, h = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, w, h).data;

  // Backdrop colour sampled from the corners.
  const at = (x, y) => { const i = (y * w + x) * 4; return [px[i], px[i + 1], px[i + 2]]; };
  const corners = [at(2, 2), at(w - 3, 2), at(2, h - 3), at(w - 3, h - 3)];
  const bg = [0, 1, 2].map((k) => Math.round(corners.reduce((s, c2) => s + c2[k], 0) / corners.length));

  // Bounding box of everything that is not backdrop.
  const TOL = 26;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (px[i + 3] < 8) continue;
      const d = Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]);
      if (d > TOL) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }

  // Square crop centred on the coin.
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const side = Math.max(maxX - minX, maxY - minY);
  const sx = Math.max(0, Math.round(cx - side / 2));
  const sy = Math.max(0, Math.round(cy - side / 2));
  const sSide = Math.min(side, w - sx, h - sy);

  // Circular mask, then downscale.
  const out = document.createElement('canvas');
  out.width = SIZE; out.height = SIZE;
  const octx = out.getContext('2d');
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.beginPath();
  octx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2);
  octx.closePath();
  octx.clip();
  octx.drawImage(c, sx, sy, sSide, sSide, 0, 0, SIZE, SIZE);

  return {
    png: out.toDataURL('image/png').split(',')[1],
    source: `${w}x${h}`,
    coinBox: { minX, minY, maxX, maxY },
    crop: { sx, sy, side: sSide },
    bg,
  };
}, { dataUrl, SIZE });

await browser.close();

const buf = Buffer.from(result.png, 'base64');
writeFileSync(OUT, buf);

console.log(`source      : ${result.source} (${(readFileSync(SRC).length / 1024).toFixed(0)} kB)`);
console.log(`backdrop rgb: ${result.bg.join(',')}`);
console.log(`coin bbox   : x ${result.coinBox.minX}-${result.coinBox.maxX}, y ${result.coinBox.minY}-${result.coinBox.maxY}`);
console.log(`crop        : ${result.crop.side}px square at (${result.crop.sx},${result.crop.sy})`);
console.log(`written     : public/miocoin-icon.png  ${SIZE}x${SIZE}  ${(buf.length / 1024).toFixed(1)} kB`);
