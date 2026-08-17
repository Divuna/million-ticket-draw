import { expect, test } from '@playwright/test';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  SHOPTET_GUIDE_INTRO,
  SHOPTET_GUIDE_PDF_PATH,
  SHOPTET_GUIDE_RESULTS,
  SHOPTET_GUIDE_STEPS,
  SHOPTET_GUIDE_TITLE,
} from '../../src/content/partnerGuides/shoptetGuide';

/**
 * Spec 133 — the partner guide "Jak propojit Shoptet s OneMil".
 *
 * The guide exists twice: as a page in the partner portal and as a downloadable
 * PDF. Both are rendered from src/content/partnerGuides/shoptetGuide.ts, and the
 * job of this spec is to keep that true — a guide whose PDF says something the page
 * does not is worse than having no PDF, because a partner follows the stale one.
 *
 * It also guards the two things that would quietly break the guide: a screenshot
 * file disappearing from public/, and a real export link or partner id being
 * committed with the images.
 *
 * No network, no DB, no emails.
 */

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');

const page = read('src/pages/PartnerGuides.tsx');
const app = read('src/App.tsx');
const pdfScript = read('scripts/build-partner-guide-pdf.mjs');
const contentSrc = read('src/content/partnerGuides/shoptetGuide.ts');

const PDF_FILE = 'public' + SHOPTET_GUIDE_PDF_PATH;

// ───────────────────────────────────────────────────────────────────────────────
// 1. The steps, in the order the partner has to perform them
// ───────────────────────────────────────────────────────────────────────────────

test('133a the guide has the six steps in the required order', () => {
  expect(SHOPTET_GUIDE_STEPS.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6]);
  expect(SHOPTET_GUIDE_STEPS.map((s) => s.title)).toEqual([
    'Povolte OneMilu přístup k exportu',
    'Vytvořte export objednávek',
    'Zkopírujte permanentní odkaz exportu',
    'Odešlete propojení v OneMilu',
    'Počkejte na schválení',
    'Zapněte zobrazení MioCoinů v e-shopu',
  ]);
});

test('133b each step keeps the instructions that make it followable', () => {
  const body = (n: number) => SHOPTET_GUIDE_STEPS[n - 1].body.join(' ');

  // Where to click in Shoptet / OneMil.
  expect(body(1)).toContain('Nastavení → Administrace → Zabezpečení exportů');
  expect(body(1)).toContain('onemil');
  expect(body(1)).toContain('aktivní a svítí zeleně');

  expect(body(2)).toContain('Objednávky → Export objednávek → Vytvořit vlastní typ exportu');
  expect(body(2)).toContain('CSV');
  expect(body(2)).toContain('Jen nové nebo změněné');

  expect(body(3)).toContain('Permanentní odkaz zvoleného exportu');

  expect(body(4)).toContain('Napojení e-shopu / Shoptet');
  expect(body(4)).toContain('URL Shoptet exportu objednávek');
  expect(body(4)).toContain('Po zaplacení objednávky');
  expect(body(4)).toContain('Odeslat ke schválení');

  expect(body(5)).toContain('Odesláno ke schválení');
  expect(body(5)).toContain('24 hodin');
  expect(body(5)).toContain('Aktivní');

  expect(body(6)).toContain('Zobrazení MioCoinů v e-shopu');
  expect(body(6)).toContain('Kopírovat kód');
  expect(body(6)).toContain('Vzhled a obsah → Editor HTML kódu → Zápatí (před koncovým tagem BODY)');
});

test('133c every step but the last hands over to the next one', () => {
  for (const step of SHOPTET_GUIDE_STEPS) {
    expect(step.next, `step ${step.number} has a closing line`).toBeTruthy();
  }
  expect(SHOPTET_GUIDE_STEPS[0].next).toContain('Nyní přejděte k vytvoření exportu objednávek');
  expect(SHOPTET_GUIDE_STEPS[2].next).toContain('vraťte do OneMilu');
  expect(SHOPTET_GUIDE_STEPS[5].next).toContain('automaticky podle vašeho aktuálního nastavení v OneMilu');
});

test('133d the guide ends with the three customer-facing results', () => {
  expect(SHOPTET_GUIDE_RESULTS).toHaveLength(3);
  const notes = SHOPTET_GUIDE_RESULTS.map((r) => r.note ?? '');
  expect(notes[0]).toContain('výpisu produktů');
  expect(notes[1]).toContain('detailu produktu');
  // The exact sentence the guide has to end on.
  expect(notes[2]).toBe(
    'V objednávce zákazník vidí také celkový počet MioCoinů, které za celý nákup získá.',
  );
});

// ───────────────────────────────────────────────────────────────────────────────
// 2. Screenshots
// ───────────────────────────────────────────────────────────────────────────────

test('133e every referenced screenshot exists in public/', () => {
  const all = [...SHOPTET_GUIDE_STEPS.flatMap((s) => s.shots), ...SHOPTET_GUIDE_RESULTS];
  expect(all.length).toBeGreaterThan(0);

  for (const shot of all) {
    const file = resolve(process.cwd(), 'public' + shot.src);
    expect(statSync(file).size, `${shot.src} is a real file`).toBeGreaterThan(1000);
    // A screenshot with no alt text is unusable for anyone on a screen reader.
    expect(shot.alt.length, `${shot.src} has alt text`).toBeGreaterThan(10);
  }
});

test('133f no real export link, hash or partner id is committed with the guide', () => {
  // The screenshots ship anonymised: the permanent export link, the widget snippet
  // (which carries the partner uuid) and the shop name are blurred at the source.
  // Nothing in the guide's own text may reintroduce one.
  const sources = [contentSrc, page, pdfScript];
  for (const src of sources) {
    expect(src).not.toMatch(/myshoptet/i);
    expect(src).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(src).not.toMatch(/\bhash=/i);
    expect(src).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    expect(src).not.toMatch(/https?:\/\/[^\s'"`]*export[^\s'"`]*\.(csv|xml)/i);
  }
});

// ───────────────────────────────────────────────────────────────────────────────
// 3. Page and navigation
// ───────────────────────────────────────────────────────────────────────────────

test('133g the portal has a Návody entry pointing at /partner/navody', () => {
  expect(app).toContain('<Route path="/partner/navody" element={<PartnerGuides />} />');
  expect(app).toContain('<Link to="/partner/navody">');
  expect(app).toContain('Návody');

  // Partner header only — the customer and admin navigations are untouched.
  const header = app.slice(app.indexOf('function PartnerHeader'), app.indexOf('interface PartnerHeaderData'));
  expect(header).toContain('/partner/navody');
});

test('133h the page renders the shared content, not its own copy of the text', () => {
  expect(page).toContain("from '@/content/partnerGuides/shoptetGuide'");
  expect(page).toContain('SHOPTET_GUIDE_STEPS.map');
  expect(page).toContain('SHOPTET_GUIDE_RESULTS.map');

  // The step titles and bodies must not be duplicated as literals in the page.
  for (const step of SHOPTET_GUIDE_STEPS) {
    expect(page, `step ${step.number} title is not hardcoded in the page`).not.toContain(step.title);
  }
});

test('133i screenshots open in a larger preview', () => {
  expect(page).toContain('Zvětšit');
  expect(page).toContain('<Dialog');
  expect(page).toContain('onOpen(shot)');
});

test('133j the page only reads — it changes nothing', () => {
  // A guide page has no business writing anything.
  expect(page).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
  expect(page).not.toMatch(/\.rpc\(/);
  expect(page).not.toMatch(/functions\.invoke/);
  // Reward, widget, payment and import logic are not touched by a guide.
  expect(page).not.toMatch(/compute_partner_reward|buy_ticket_atomic|shoptet_connection_requests/);
});

// ───────────────────────────────────────────────────────────────────────────────
// 4. PDF
// ───────────────────────────────────────────────────────────────────────────────

test('133k the PDF is a real committed file offered as a download', () => {
  const stat = statSync(resolve(process.cwd(), PDF_FILE));
  // The screenshots alone are ~1 MB; a PDF far below that lost its images.
  expect(stat.size).toBeGreaterThan(300_000);

  const head = readFileSync(resolve(process.cwd(), PDF_FILE)).subarray(0, 5).toString('latin1');
  expect(head).toBe('%PDF-');

  expect(page).toContain(`href={SHOPTET_GUIDE_PDF_PATH}`);
  expect(page).toContain('Stáhnout PDF návod');
  expect(page).toContain('download');
});

test('133l the PDF is generated from the same content module as the page', () => {
  expect(pdfScript).toContain("from '../src/content/partnerGuides/shoptetGuide.ts'");
  expect(pdfScript).toContain('SHOPTET_GUIDE_STEPS');
  expect(pdfScript).toContain('SHOPTET_GUIDE_RESULTS');

  // The build fails loudly if a screenshot does not render. Without this, a broken
  // <img> still lays out and prints, so the script would happily write a PDF of
  // empty boxes — which is exactly what happened before this check existed.
  expect(pdfScript).toContain('naturalWidth === 0');
  expect(pdfScript).toContain('Screenshots did not render');
});

test('133m the committed PDF is not older than the guide content', () => {
  // Guards the one failure mode of a generated artifact: someone edits a step and
  // ships without re-running `npm run build:partner-guide-pdf`.
  const pdfTime = statSync(resolve(process.cwd(), PDF_FILE)).mtimeMs;
  const contentTime = statSync(
    resolve(process.cwd(), 'src/content/partnerGuides/shoptetGuide.ts'),
  ).mtimeMs;
  expect(
    pdfTime,
    'PDF is stale — run `npm run build:partner-guide-pdf` after changing the guide content',
  ).toBeGreaterThanOrEqual(contentTime - 1000);
});

test('133n the title and intro are shared by both versions', () => {
  expect(SHOPTET_GUIDE_TITLE).toBe('Jak propojit Shoptet s OneMil');
  expect(SHOPTET_GUIDE_INTRO.length).toBeGreaterThan(20);
  expect(pdfScript).toContain('SHOPTET_GUIDE_TITLE');
  expect(page).toContain('SHOPTET_GUIDE_TITLE');
});
