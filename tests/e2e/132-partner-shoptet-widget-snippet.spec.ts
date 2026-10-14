import { expect, test, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildShoptetWidgetSnippet, getShoptetWidgetSrc } from '../../src/lib/shoptetWidgetSnippet';

/**
 * Spec 132 — the storefront snippet offered in the partner dashboard.
 *
 * The dashboard hands an approved Shoptet partner a ready-made <script> tag so they
 * never have to find their own partner id. Two things have to hold:
 *
 *   1. the snippet is exactly what public/shoptet-widget.js already reads — a wrong
 *      attribute name would fail silently in a real shop, because the widget's first
 *      act is `if (!partnerId) return;`
 *   2. it points at production, even when the dashboard is served from a preview
 *      build — a preview src would quote the partner from the wrong environment
 *
 * 132d does not compare strings: it feeds the generated snippet to the real widget in
 * a page and checks the widget actually resolves the partner from it.
 *
 * No network, no DB, no emails, no reward maths.
 */

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');

const widgetSrc = read('public/shoptet-widget.js');
const dashboard = read('src/pages/PartnerDashboard.tsx');
const lib = read('src/lib/shoptetWidgetSnippet.ts');

const PARTNER = '61c23960-7271-4c75-a1a4-dcb6e81b41ce';

// ───────────────────────────────────────────────────────────────────────────────
// 1. Snippet shape
// ───────────────────────────────────────────────────────────────────────────────

test('132a the snippet is the documented widget tag, filled in for this partner', () => {
  const snippet = buildShoptetWidgetSnippet(PARTNER)!;

  expect(snippet).toBe(
    `<script src="https://onemil.cz/shoptet-widget.js" data-onemil-partner="${PARTNER}" defer></script>`,
  );

  // The partner id is embedded, so nobody has to look it up.
  expect(snippet).toContain(PARTNER);
  expect(snippet).not.toMatch(/PARTNER-UUID|YOUR|VAŠE|<partner/i);
});

test('132b no id means no snippet, rather than a tag that silently does nothing', () => {
  // The widget returns early on a missing id, so an empty attribute would look
  // installed and never render anything.
  expect(buildShoptetWidgetSnippet(null)).toBeNull();
  expect(buildShoptetWidgetSnippet(undefined)).toBeNull();
  expect(buildShoptetWidgetSnippet('')).toBeNull();
  expect(buildShoptetWidgetSnippet('   ')).toBeNull();
});

test('132c the src is production and carries no secret', () => {
  const src = getShoptetWidgetSrc();
  expect(src).toBe('https://onemil.cz/shoptet-widget.js');

  const snippet = buildShoptetWidgetSnippet(PARTNER)!;
  expect(snippet).not.toMatch(/localhost|127\.0\.0\.1|lovable|preview--/i);
  // Nothing that could be a key, token or export URL may reach a storefront tag.
  expect(snippet).not.toMatch(/apikey|api_key|service_role|token|secret|vault|myshoptet/i);
  expect(snippet).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/); // a JWT
  // The staging project ref must never be handed to a real shop.
  expect(snippet).not.toContain('dxmowysntemfqfnanxua');

  // The snippet deliberately does not pin data-onemil-api: the widget's built-in
  // default is production, and an explicit endpoint here would be a second place to
  // keep in sync.
  expect(snippet).not.toContain('data-onemil-api');
});

// ───────────────────────────────────────────────────────────────────────────────
// 2. The widget really accepts it
// ───────────────────────────────────────────────────────────────────────────────

test('132d the real widget resolves the partner from the generated snippet', async ({ page }) => {
  const snippet = buildShoptetWidgetSnippet(PARTNER)!;
  const SHOP = 'http://localhost:8080/__snippet_probe__';

  // Serve the repo's actual widget for the absolute production src in the snippet,
  // so the src path itself is exercised rather than rewritten to something local.
  await page.route('https://onemil.cz/shoptet-widget.js', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: widgetSrc,
    });
  });

  // Capture what the widget asks the reward engine for. If the snippet's attribute
  // name were wrong, the widget would bail out and nothing would be requested.
  const asked: Array<Record<string, unknown>> = [];
  await page.route('**/partner-reward-preview', async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' },
      });
      return;
    }
    asked.push(JSON.parse(route.request().postData() ?? '{}'));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ status: 'ok', enabled: true, coins: 1.5, mc_display: '1,5' }),
    });
  });

  const DL = JSON.stringify([{
    shoptet: {
      pageId: 2, pageType: 'productDetail', currency: 'CZK', language: 'cs', projectId: 809915,
      product: { codes: [{ code: 'SKU-1' }], priceWithVat: 300 },
    },
  }]);

  await page.route(SHOP, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body:
        `<!doctype html><html lang="cs"><head><meta charset="utf-8"><title>produkt</title>` +
        `<script>window.dataLayer = ${DL};</script></head><body>` +
        `<div class="p-detail-inner"><div class="price-final">300 Kč</div></div>` +
        // The snippet under test, pasted verbatim — exactly what the partner copies.
        snippet +
        `</body></html>`,
    });
  });

  await page.goto(SHOP, { waitUntil: 'load' });

  await expect
    .poll(() => asked.length, { timeout: 10_000, message: 'widget never called the reward engine' })
    .toBeGreaterThan(0);

  // The widget read the partner id out of the snippet and sent it upstream.
  const partnerIds = new Set(asked.map((b) => b.partner_id));
  expect([...partnerIds]).toEqual([PARTNER]);
});

// ───────────────────────────────────────────────────────────────────────────────
// 3. Where the dashboard shows it
// ───────────────────────────────────────────────────────────────────────────────

test('132e the section is gated on an approved/active Shoptet connection', () => {
  // Only after OneMil's own review — never for a draft, a submitted request, or a
  // rejected one.
  expect(dashboard).toContain(
    "shoptetReq?.status === 'approved' || shoptetReq?.status === 'active'",
  );
  expect(dashboard).toContain(
    '{isAccountApproved && isShoptetConnectionLive && shoptetWidgetSnippet && (',
  );
});

test('132f the manual admin approval of a Shoptet connection is untouched', () => {
  // The dashboard only READS the request status. It must never set it, and it must
  // not gain a second path that bypasses submit-shoptet-connection.
  expect(dashboard).toContain("supabase.functions.invoke('submit-shoptet-connection'");
  expect(dashboard).not.toContain('approve-shoptet-connection');
  expect(dashboard).not.toMatch(/status:\s*'(approved|active)'/);

  // The snippet helper touches nothing but string building.
  expect(lib).not.toMatch(/supabase|fetch\(|\.from\(|\.rpc\(/);
});

test('132g the section carries the exact instructions the partner needs', () => {
  const section = dashboard.slice(
    dashboard.indexOf('shoptet-widget-snippet-section'),
    dashboard.indexOf('MioCoin Invoicing Explainer'),
  );
  expect(section.length).toBeGreaterThan(0);

  expect(section).toContain('Zobrazení MioCoinů v e-shopu');
  expect(section).toContain('Vzhled a obsah');
  expect(section).toContain('Editor HTML kódu');
  expect(section).toContain('kód na všech stránkách vlož');
  expect(section).toContain('Kopírovat kód');
  expect(section).toContain(
    'Po vložení kódu a uložení se informace o MioCoinech zobrazí automaticky podle',
  );
  expect(section).toContain('vašeho aktuálního nastavení v OneMil.');

  // The copy button copies the generated snippet, not a hand-written string.
  expect(section).toContain('copyShoptetSnippetToClipboard(shoptetWidgetSnippet)');
});

test('132h reward, widget, payment and import logic are not re-implemented here', () => {
  // The widget stays the only renderer and compute_partner_reward the only engine.
  expect(lib).not.toMatch(/reward_mc|reward_base_czk|Math\.(floor|round|ceil)/);
  expect(lib).not.toMatch(/miocoin|coins/i);

  // The widget still refuses to run without the attribute the snippet supplies —
  // this is the contract 132a encodes.
  expect(widgetSrc).toContain("script.getAttribute('data-onemil-partner')");
  expect(widgetSrc).toContain('if (!partnerId) return;');
});
