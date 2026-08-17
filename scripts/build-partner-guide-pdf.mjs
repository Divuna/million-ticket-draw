/**
 * Renders the partner guide PDF from the SAME content module the portal page uses,
 * so the download and the web version can never say different things.
 *
 *   npm run build:partner-guide-pdf
 *
 * Output: public/navody/OneMil-navod-Shoptet.pdf
 *
 * The screenshots are read from public/navody/shoptet — the anonymised captures
 * shipped in OneMil_Shoptet_navod_balicek. Nothing here composes a new screenshot,
 * and no export link, hash or partner id is ever written into the document.
 *
 * Re-run this whenever src/content/partnerGuides/shoptetGuide.ts changes; spec 133
 * fails if the committed PDF is older than the content module.
 */
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SHOPTET_GUIDE_INTRO,
  SHOPTET_GUIDE_PDF_PATH,
  SHOPTET_GUIDE_RESULTS,
  SHOPTET_GUIDE_RESULT_TITLE,
  SHOPTET_GUIDE_STEPS,
  SHOPTET_GUIDE_TITLE,
} from '../src/content/partnerGuides/shoptetGuide.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'public');
const outPath = join(publicDir, SHOPTET_GUIDE_PDF_PATH.replace(/^\//, ''));

const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** `**bold**` → <strong>, matching renderEmphasis() on the page. */
const emphasis = (s) =>
  escapeHtml(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

/**
 * Screenshots are inlined as data URIs. A file:// <img> inside a page created with
 * setContent is blocked by Chromium (the document has an opaque origin), which
 * silently produces a PDF full of broken-image boxes — it renders and writes fine,
 * so nothing fails; the images are simply missing.
 */
const shotDataUri = async (src) => {
  const buf = await readFile(join(publicDir, src.replace(/^\//, '')));
  return `data:image/png;base64,${buf.toString('base64')}`;
};

const shotHtml = async (shot) => `
  <figure class="shot">
    <img src="${await shotDataUri(shot.src)}" alt="${escapeHtml(shot.alt)}">
    ${shot.note ? `<figcaption>${escapeHtml(shot.note)}</figcaption>` : ''}
  </figure>`;

const joinAsync = async (items, fn) => (await Promise.all(items.map(fn))).join('');

const stepHtml = async (step) => `
  <section class="step">
    <div class="step-head">
      <span class="num">${step.number}</span>
      <div>
        <div class="eyebrow">KROK ${step.number}</div>
        <h2>${escapeHtml(step.title)}</h2>
      </div>
    </div>
    <div class="copy">${step.body.map((p) => `<p>${emphasis(p)}</p>`).join('')}</div>
    ${await joinAsync(step.shots, shotHtml)}
    ${step.next ? `<p class="next">${escapeHtml(step.next)}</p>` : ''}
  </section>`;

const html = `<!doctype html>
<html lang="cs"><head><meta charset="utf-8"><title>${escapeHtml(SHOPTET_GUIDE_TITLE)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm 18mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Inter, "Segoe UI", Arial, sans-serif; color: #14181f; font-size: 11pt; line-height: 1.55; }
  h1 { font-size: 26pt; line-height: 1.15; margin: 0 0 8pt; }
  h2 { font-size: 15pt; margin: 2pt 0 0; }
  .lede { color: #4d5765; font-size: 11.5pt; margin: 0 0 6pt; max-width: 52em; }
  .cover { border-bottom: 2px solid #ff9d00; padding-bottom: 14pt; margin-bottom: 18pt; }
  .brand { font-weight: 800; color: #ff9d00; letter-spacing: .04em; font-size: 10pt; margin-bottom: 6pt; }
  /* Each step stays on one page where it fits — a step split across a page break
     separates an instruction from its screenshot, which is what makes printed
     guides hard to follow. */
  .step { break-inside: avoid; page-break-inside: avoid; border: 1px solid #dfe4ec; border-radius: 10pt; padding: 14pt; margin: 0 0 14pt; }
  .step-head { display: flex; align-items: flex-start; gap: 10pt; margin-bottom: 8pt; }
  .num { flex: 0 0 auto; width: 26pt; height: 26pt; border-radius: 50%; background: #ff9d00; color: #14181f;
         font-weight: 800; font-size: 13pt; display: flex; align-items: center; justify-content: center; }
  .eyebrow { color: #b56d00; font-weight: 800; font-size: 8pt; letter-spacing: .09em; }
  .copy p { margin: 0 0 5pt; color: #333c49; }
  .copy strong { color: #14181f; }
  .shot { margin: 10pt 0 0; break-inside: avoid; page-break-inside: avoid; }
  .shot img { display: block; width: 100%; height: auto; border: 1px solid #cdd5e1; border-radius: 6pt; background: #fff; }
  .shot figcaption { margin-top: 4pt; font-size: 8.5pt; color: #6a7484; }
  .next { margin: 10pt 0 0; padding: 8pt 10pt; border: 1px solid #f0c98a; background: #fff8ec;
          border-radius: 7pt; font-weight: 600; color: #7a4d00; }
  .results { break-before: page; page-break-before: always; }
  .results h2 { margin-bottom: 8pt; }
</style></head>
<body>
  <header class="cover">
    <div class="brand">ONEMIL · PARTNERSKÝ PORTÁL</div>
    <h1>${escapeHtml(SHOPTET_GUIDE_TITLE)}</h1>
    <p class="lede">${escapeHtml(SHOPTET_GUIDE_INTRO)}</p>
  </header>
  ${await joinAsync(SHOPTET_GUIDE_STEPS, stepHtml)}
  <section class="results">
    <h2>${escapeHtml(SHOPTET_GUIDE_RESULT_TITLE)}</h2>
    ${await joinAsync(SHOPTET_GUIDE_RESULTS, shotHtml)}
  </section>
</body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  // setContent resolves before the images decode, so wait for them and then PROVE
  // they actually rendered. A broken <img> still lays out and prints, so without
  // this check the script happily writes a PDF of empty boxes.
  const broken = await page.evaluate(async () => {
    const imgs = [...document.images];
    await Promise.all(imgs.map((i) => i.decode().catch(() => {})));
    return imgs.filter((i) => i.naturalWidth === 0).map((i) => i.alt || '(no alt)');
  });
  if (broken.length > 0) {
    throw new Error(`Screenshots did not render: ${broken.join(' | ')}`);
  }
  const imageCount = await page.evaluate(() => document.images.length);
  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate:
      '<div style="width:100%;font-size:8pt;color:#8a93a3;padding:0 14mm;display:flex;justify-content:space-between;">' +
      '<span>OneMil — Jak propojit Shoptet s OneMil</span>' +
      '<span class="pageNumber"></span></div>',
    margin: { top: '16mm', bottom: '18mm', left: '14mm', right: '14mm' },
  });
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, pdf);
  console.log(`PDF written: ${outPath} (${pdf.length} bytes, ${imageCount} screenshots embedded)`);
} finally {
  await browser.close();
}
