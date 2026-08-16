import { expect, test, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Spec 126 — Shoptet widget sends order_total_czk.
 *
 * Regression for a real gap found in production: compute_partner_reward requires
 * order_total_czk in whole_shop mode — the DEFAULT for every partner — but the
 * widget sent only items[]. The endpoint answered `invalid_order_total_czk` and the
 * customer saw nothing, even though the partner's backend and import were fine.
 *
 * These tests load the REAL public/shoptet-widget.js in a browser against a
 * Shoptet-shaped DOM, intercept the preview call, and assert on the exact payload
 * the widget sends plus what it renders. The reward endpoint is stubbed, so no
 * network, no DB and no MioCoin maths happen in the test — that stays server-side.
 */

const PARTNER = '44444444-4444-4444-4444-444444444444';
const PREVIEW_GLOB = '**/partner-reward-preview';

type Captured = { partner_id?: string; items?: Array<Record<string, number | string>>; order_total_czk?: number };

// The widget posts JSON cross-origin, so the browser sends a CORS preflight first.
// The stub must answer OPTIONS properly or fetch rejects and the widget silently
// renders nothing — which looks exactly like the bug under test.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Stubs the preview endpoint, capturing every request payload. */
async function stubPreview(page: Page, response: Record<string, unknown>): Promise<Captured[]> {
  const captured: Captured[] = [];
  await page.route(PREVIEW_GLOB, async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    captured.push(JSON.parse(route.request().postData() ?? '{}'));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify(response),
    });
  });
  return captured;
}

const FAKE_SHOP_URL = 'http://localhost:8080/__onemil_widget_test__';

/**
 * Loads the real widget over a given storefront DOM.
 *
 * The page is served as a genuine UTF-8 HTML response rather than via setContent:
 * setContent reuses the current document, which keeps the encoding of whatever was
 * navigated to before, so a <meta charset> written into it is ignored and the
 * widget's Czech strings come out as mojibake. Serving it properly also keeps the
 * localhost origin, so the relative script URL hits the real dev-server file.
 */
async function mountWidget(page: Page, bodyHtml: string) {
  await page.route(FAKE_SHOP_URL, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body:
        `<!doctype html><html lang="cs"><head><meta charset="utf-8"><title>shop</title></head><body>` +
        `${bodyHtml}` +
        `<script src="/shoptet-widget.js" data-onemil-partner="${PARTNER}" ` +
        `data-onemil-api="https://stub.invalid/functions/v1/partner-reward-preview"></script>` +
        `</body></html>`,
    });
  });
  await page.goto(FAKE_SHOP_URL, { waitUntil: 'load' });
}

const CART_DOM = `
  <div class="cart-content">
    <div class="cart-item" data-micro-product-id="1" data-micro-product-code="ABC123">
      <span class="price" data-micro-price="249">249 Kč</span>
      <input name="quantity" value="2" />
    </div>
    <div class="cart-item" data-micro-product-id="2" data-micro-product-code="XYZ999">
      <span class="price" data-micro-price="300">300 Kč</span>
      <input name="quantity" value="1" />
    </div>
    <div class="cart-summary"></div>
  </div>`;

const PRODUCT_DOM = `
  <div class="p-detail-inner-header"></div>
  <div data-micro-product-code="ABC123">ABC123</div>
  <span data-micro-price="249">249 Kč</span>`;

test.describe('126 — widget sends order_total_czk', () => {

  test('126a) whole_shop CART: sends order_total_czk = sum(price x qty) and renders the reward', async ({ page }) => {
    // whole_shop returns an empty per-item breakdown and a total.
    const captured = await stubPreview(page, {
      status: 'ok', enabled: true, coins: 24, reward_mode: 'whole_shop',
      items: [], product_badge_enabled: true,
    });

    await mountWidget(page, CART_DOM);
    await expect.poll(() => captured.length, { timeout: 10_000 }).toBeGreaterThan(0);

    const cartCall = captured.find((c) => (c.items?.length ?? 0) === 2);
    expect(cartCall, 'widget must send both basket items').toBeTruthy();
    // 249*2 + 300*1 = 798 — the regression this spec exists for.
    expect(cartCall!.order_total_czk, 'order_total_czk must be the basket goods value').toBe(798);
    expect(cartCall!.partner_id).toBe(PARTNER);
    expect(cartCall!.items).toEqual([
      { code: 'ABC123', quantity: 2, unit_price_czk: 249 },
      { code: 'XYZ999', quantity: 1, unit_price_czk: 300 },
    ]);

    // Cart wording stays an estimate — shipping/discounts can still move the final order.
    await expect(page.locator('.onemil-mc-widget')).toContainText('Dárek od nás: 24 MioCoinů do soutěží OneMil');
  });

  test('126b) whole_shop PRODUCT badge: sends unit price as order_total_czk and renders', async ({ page }) => {
    const captured = await stubPreview(page, {
      status: 'ok', enabled: true, coins: 12, reward_mode: 'whole_shop',
      items: [], product_badge_enabled: true,
    });

    await mountWidget(page, PRODUCT_DOM);
    await expect.poll(() => captured.length, { timeout: 10_000 }).toBeGreaterThan(0);

    const productCall = captured.find((c) => (c.items?.length ?? 0) === 1);
    expect(productCall, 'widget must send the viewed product').toBeTruthy();
    expect(productCall!.items).toEqual([{ code: 'ABC123', quantity: 1, unit_price_czk: 249 }]);
    // Without this the badge never appeared for a default-mode partner.
    expect(productCall!.order_total_czk, 'product badge must send the product price').toBe(249);

    await expect(page.locator('.onemil-mc-widget')).toContainText('Za tento produkt získáte 12 MioCoinů');
  });

  test('126c) selected_products badge still uses the per-SKU figure from the engine', async ({ page }) => {
    // selected_products returns the SKU's own amount in items[].
    await stubPreview(page, {
      status: 'ok', enabled: true, coins: 10, reward_mode: 'selected_products',
      items: [{ code: 'abc123', coins: 10 }], product_badge_enabled: true,
    });

    await mountWidget(page, PRODUCT_DOM);

    await expect(page.locator('.onemil-mc-widget')).toContainText('Za tento produkt získáte 10 MioCoinů');
  });

  test('126d) quantity change re-sends an updated order_total_czk', async ({ page }) => {
    const captured = await stubPreview(page, {
      status: 'ok', enabled: true, coins: 24, reward_mode: 'whole_shop',
      items: [], product_badge_enabled: true,
    });

    await mountWidget(page, CART_DOM);
    await expect.poll(() => captured.filter((c) => (c.items?.length ?? 0) === 2).length,
      { timeout: 10_000 }).toBeGreaterThan(0);
    const before = captured.filter((c) => (c.items?.length ?? 0) === 2).length;

    // Customer raises the first line from 2 to 5 pieces: 249*5 + 300 = 1545.
    await page.locator('input[name="quantity"]').first().fill('5');
    await page.locator('input[name="quantity"]').first().dispatchEvent('change');

    await expect
      .poll(() => captured.filter((c) => (c.items?.length ?? 0) === 2).length, { timeout: 10_000 })
      .toBeGreaterThan(before);

    const latest = captured.filter((c) => (c.items?.length ?? 0) === 2).pop()!;
    expect(latest.order_total_czk, 'total must follow the new quantity').toBe(1545);
    expect(latest.items?.[0]).toEqual({ code: 'ABC123', quantity: 5, unit_price_czk: 249 });
  });

  test('126e) product_badge_enabled=false hides the product badge but keeps the cart line', async ({ page }) => {
    await stubPreview(page, {
      status: 'ok', enabled: true, coins: 24, reward_mode: 'whole_shop',
      items: [], product_badge_enabled: false,
    });

    // Product page: badge must stay hidden.
    await mountWidget(page, PRODUCT_DOM);
    await page.waitForTimeout(1_500);
    await expect(page.locator('.onemil-mc-widget')).toHaveCount(0);

    // Cart: the summary is NOT toggleable and must still render.
    await mountWidget(page, CART_DOM);
    await expect(page.locator('.onemil-mc-widget')).toContainText('Dárek od nás: 24 MioCoinů do soutěží OneMil');
  });

  test('126f) widget renders the engine figure verbatim — no reward maths in JS', async ({ page }) => {
    // A total that no client-side formula would produce from 798 Kc: proves the
    // widget prints whatever the engine returned rather than deriving it.
    await stubPreview(page, {
      status: 'ok', enabled: true, coins: 4242, reward_mode: 'whole_shop',
      items: [], product_badge_enabled: true,
    });

    await mountWidget(page, CART_DOM);
    await expect(page.locator('.onemil-mc-widget')).toContainText('4242 MioCoinů');

    // Static guard: the only arithmetic allowed is assembling the order value.
    const src = readFileSync(resolve(process.cwd(), 'public/shoptet-widget.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

    expect(src).not.toContain('reward_base_czk');
    expect(src).not.toContain('reward_mc');
    expect(src).not.toContain('fixed_mc');
    expect(src).not.toContain('ratio_base_czk');
    // No coins value is ever computed, only read from the response.
    expect(src).not.toMatch(/coins\s*=\s*[^;]*[*/]/);
    expect(src).not.toMatch(/Math\.(floor|round|ceil)\s*\([^)]*coins/);
    // And no credential may ship to a storefront.
    expect(src.toLowerCase()).not.toContain('service_role');
    expect(src.toLowerCase()).not.toContain('bearer');
  });

  test('126g) empty basket sends nothing and renders nothing', async ({ page }) => {
    const captured = await stubPreview(page, {
      status: 'ok', enabled: true, coins: 24, reward_mode: 'whole_shop', items: [], product_badge_enabled: true,
    });

    await mountWidget(page, '<div class="cart-content"><div class="cart-summary"></div></div>');
    await page.waitForTimeout(1_500);

    expect(captured.filter((c) => (c.items?.length ?? 0) > 0)).toHaveLength(0);
    await expect(page.locator('.onemil-mc-widget')).toHaveCount(0);
  });
});
