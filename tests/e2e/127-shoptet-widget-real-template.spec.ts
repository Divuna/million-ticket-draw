import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Spec 127 — widget against the REAL Shoptet template.
 *
 * The DOM and dataLayer fixtures below were captured from a live Shoptet storefront
 * (809915.myshoptet.com, product "Linteo box kapesníků"). The previous selectors
 * were written from assumption and matched nothing there, so the widget bailed out
 * before ever calling the preview endpoint — no badge, no cart line, zero network
 * requests. These tests lock the real shape in.
 *
 * Verified real structure:
 *   window.dataLayer[i].shoptet.pageType             "productDetail" | "cart"
 *   window.dataLayer[i].shoptet.product.codes[]      [{code:"49396/ZEL"}, ...]
 *   window.dataLayer[i].shoptet.product.priceWithVat 50
 *   window.dataLayer[i].shoptet.cart[]               [{code, quantity, priceWithVat,
 *                                                     priceWithoutDiscount, name}]
 *   cart row  <tr data-micro="cartItem" data-micro-sku="49396/ZEL">
 *   qty input <input name="amount" class="amount">
 *   product   <meta itemprop="sku">, <meta itemprop="price">, .price-final
 *
 * Note the cart line carries priceWithVat (after discount) AND priceWithoutDiscount;
 * the widget must send the after-discount one.
 */

const PARTNER = '61c23960-7271-4c75-a1a4-dcb6e81b41ce';
const PREVIEW_GLOB = '**/partner-reward-preview';
const SHOP_URL = 'http://localhost:8080/__real_shoptet__';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Captured = { partner_id?: string; items?: Array<Record<string, unknown>>; order_total_czk?: number };

async function stubPreview(page: Page, response: Record<string, unknown>): Promise<Captured[]> {
  const captured: Captured[] = [];
  await page.route(PREVIEW_GLOB, async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    captured.push(JSON.parse(route.request().postData() ?? '{}'));
    await route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(response) });
  });
  return captured;
}

/** Serves a page shaped like the real Shoptet template, with the real dataLayer. */
async function mountShoptet(page: Page, opts: { dataLayer: string; body: string }) {
  await page.route(SHOP_URL, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body:
        `<!doctype html><html lang="cs"><head><meta charset="utf-8"><title>shop</title>` +
        `<script>window.dataLayer = ${opts.dataLayer};</script></head><body>` +
        opts.body +
        `<script src="/shoptet-widget.js" data-onemil-partner="${PARTNER}" ` +
        `data-onemil-api="https://stub.invalid/functions/v1/partner-reward-preview"></script>` +
        `</body></html>`,
    });
  });
  await page.goto(SHOP_URL, { waitUntil: 'load' });
}

// Real productDetail dataLayer (trimmed to the fields the widget reads).
const PRODUCT_DL = JSON.stringify([{
  shoptet: {
    pageId: 683, pageType: 'productDetail', currency: 'CZK', language: 'cs', projectId: 809915,
    product: {
      id: 39, guid: '99fe9222-43b0-11e8-a05f-0800273dc42e', hasVariants: true,
      codes: [{ code: '49396/FIA' }, { code: '49396/ZEL' }],
      name: 'Linteo box kapesníků', manufacturer: 'Linteo', currency: 'CZK', priceWithVat: 50,
    },
  },
}]);

// Real product detail markup: schema.org meta reflects the SELECTED variant.
const PRODUCT_DOM = `
  <div class="p-detail-inner-header"><h1>Linteo box kapesníků</h1></div>
  <form action="/action/Cart/addCartItem/" id="product-detail-form">
    <meta itemprop="sku" content="49396/ZEL">
    <meta itemprop="price" content="50.00">
  </form>
  <div class="price-final-holder"><span class="price-final">50 Kč</span></div>`;

// Real cart dataLayer: note priceWithVat 50 vs priceWithoutDiscount 60.
const cartDl = (qty: number) => JSON.stringify([{
  shoptet: {
    pageId: 4, pageType: 'cart', currency: 'CZK', language: 'cs', projectId: 809915,
    cart: [{
      code: '49396/ZEL', guid: '99fe9222-43b0-11e8-a05f-0800273dc42e', priceId: 40,
      quantity: qty, priceWithVat: 50, priceWithoutDiscount: 60,
      itemId: '6a8191e43f3b0', name: 'Linteo box kapesníků Barva: Zelená', weight: 0,
    }],
  },
}]);

const CART_DOM = `
  <div class="cart-content">
    <table class="cart-table"><tbody>
      <tr class="removeable" data-micro="cartItem" data-micro-sku="49396/ZEL"
          data-micro-identifier="99fe9222-43b0-11e8-a05f-0800273dc42e">
        <td class="p-name">Linteo box kapesníků</td>
        <td><input type="number" name="amount" class="amount" value="1"></td>
        <td class="p-price">50 Kč</td>
      </tr>
    </tbody></table>
    <div class="cart-summary"></div>
  </div>`;

const OK = (coins: number, extra: Record<string, unknown> = {}) => ({
  status: 'ok', enabled: true, coins, reward_mode: 'whole_shop_with_exceptions',
  items: [], product_badge_enabled: true, ...extra,
});

test.describe('127 — widget matches the real Shoptet template', () => {

  test('127a) product detail: reads SKU + price from the real structure and renders', async ({ page }) => {
    const captured = await stubPreview(page, OK(2));
    await mountShoptet(page, { dataLayer: PRODUCT_DL, body: PRODUCT_DOM });

    await expect.poll(() => captured.length, { timeout: 10_000 }).toBeGreaterThan(0);
    const call = captured[0];
    // Selected variant SKU (from meta itemprop), not the first of codes[].
    expect(call.items).toEqual([{ code: '49396/ZEL', quantity: 1, unit_price_czk: 50 }]);
    expect(call.order_total_czk).toBe(50);

    await expect(page.locator('.onemil-mc-widget')).toContainText('Za tento produkt získáte 2 MioCoiny');
  });

  test('127b) cart: reads shoptet.cart and sends the AFTER-DISCOUNT price', async ({ page }) => {
    const captured = await stubPreview(page, OK(2));
    await mountShoptet(page, { dataLayer: cartDl(1), body: CART_DOM });

    await expect.poll(() => captured.length, { timeout: 10_000 }).toBeGreaterThan(0);
    const call = captured[0];
    // 50 = priceWithVat. 60 (priceWithoutDiscount) must never be used.
    expect(call.items).toEqual([{ code: '49396/ZEL', quantity: 1, unit_price_czk: 50 }]);
    expect(call.order_total_czk).toBe(50);
    expect(call.items?.[0].unit_price_czk, 'must be the after-discount price, not 60').not.toBe(60);

    await expect(page.locator('.onemil-mc-widget')).toContainText('Dárek od nás: 2 MioCoiny do soutěží OneMil');
  });

  test('127c) cart quantity 3 gives order_total 150', async ({ page }) => {
    const captured = await stubPreview(page, OK(7));
    await mountShoptet(page, { dataLayer: cartDl(3), body: CART_DOM });

    await expect.poll(() => captured.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(captured[0].items).toEqual([{ code: '49396/ZEL', quantity: 3, unit_price_czk: 50 }]);
    expect(captured[0].order_total_czk).toBe(150);
    await expect(page.locator('.onemil-mc-widget')).toContainText('7 MioCoinů');
  });

  test('127d) DOM fallback works when the dataLayer is absent', async ({ page }) => {
    const captured = await stubPreview(page, OK(2));
    // No shoptet object at all — must fall back to data-micro-sku + input[name=amount].
    await mountShoptet(page, { dataLayer: '[]', body: CART_DOM });

    await expect.poll(() => captured.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(captured[0].items).toEqual([{ code: '49396/ZEL', quantity: 1, unit_price_czk: 50 }]);
    expect(captured[0].order_total_czk).toBe(50);
  });

  test('127e) a cart line with no readable code still counts toward order_total', async ({ page }) => {
    const captured = await stubPreview(page, OK(5));
    const dl = JSON.stringify([{ shoptet: { pageType: 'cart', cart: [
      { code: '49396/ZEL', quantity: 1, priceWithVat: 50 },
      { code: '', quantity: 2, priceWithVat: 30 }, // e.g. a gift/unnamed line
    ] } }]);
    await mountShoptet(page, { dataLayer: dl, body: CART_DOM });

    await expect.poll(() => captured.length, { timeout: 10_000 }).toBeGreaterThan(0);
    // whole_shop is driven by the total, so the code-less line must not be lost.
    expect(captured[0].order_total_czk).toBe(110);
    // ...but only coded lines can match a per-product rule.
    expect(captured[0].items).toEqual([{ code: '49396/ZEL', quantity: 1, unit_price_czk: 50 }]);
  });

  test('127f) product badge does not leak onto the cart page', async ({ page }) => {
    const captured = await stubPreview(page, OK(2));
    await mountShoptet(page, { dataLayer: cartDl(1), body: CART_DOM });
    await page.waitForTimeout(1_500);

    // Only the cart call, never a single-item product call, and one rendered node.
    expect(captured.every((c) => (c.items?.length ?? 0) === 1 && c.order_total_czk === 50)).toBe(true);
    await expect(page.locator('.onemil-mc-widget')).toHaveCount(1);
    await expect(page.locator('.onemil-mc-widget')).toContainText('Dárek od nás:');
  });

  test('127g) rendering does not retrigger itself into a request loop', async ({ page }) => {
    const captured = await stubPreview(page, OK(2));
    await mountShoptet(page, { dataLayer: cartDl(1), body: CART_DOM });

    await expect.poll(() => captured.length, { timeout: 10_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(3_000);
    // The MutationObserver sees the widget's own insertion; identical payloads must
    // not be re-sent, otherwise the widget hammers the endpoint forever.
    expect(captured.length, `unexpected repeat requests: ${captured.length}`).toBeLessThanOrEqual(2);
  });

  test('127h) the shipped default endpoint is PRODUCTION, never staging', async ({ page }) => {
    // The published file is what real storefronts load; a staging default would quote
    // customers from staging data (or fail outright for a production-only partner).
    const src = await page.request.get('/shoptet-widget.js').then((r) => r.text());
    expect(src).toContain('xkzhjldrojjlrkezorey.supabase.co/functions/v1/partner-reward-preview');
    expect(src, 'staging ref must not be the default').not.toContain('dxmowysntemfqfnanxua');
  });
});
