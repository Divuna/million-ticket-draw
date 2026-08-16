import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Spec 128 — MioCoin badge on product listing cards.
 *
 * The card markup below is copied from the live storefront 809915.myshoptet.com
 * (category "Do domácnosti"). Real structure:
 *
 *   <div class="p" data-micro="product" data-micro-product-id="39"
 *        data-testid="productItem">
 *     <div data-micro="offer" data-micro-price="50.00">   <- clean numeric price
 *       <div class="prices">
 *         <div class="price price-final">50 Kč</div>       <- badge goes under this
 *       </div>
 *     </div>
 *     <span class="p-code">Kód: <span data-micro="sku">49396/FIA</span></span>
 *   </div>
 *
 * The category dataLayer carries no per-product array, so the cards themselves are
 * the source. MioCoins are never derived here — each card's figure comes back from
 * the reward engine via partner-reward-preview.
 */

const PARTNER = '61c23960-7271-4c75-a1a4-dcb6e81b41ce';
const PREVIEW_GLOB = '**/partner-reward-preview';
const SHOP_URL = 'http://localhost:8080/__real_shoptet_listing__';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Captured = { items?: Array<Record<string, unknown>>; order_total_czk?: number };

/** Stub that answers each single-product request with a coin value derived from the
 *  request itself, so a wrong SKU/price in the payload shows up as a wrong badge. */
async function stubPreview(
  page: Page,
  opts: { badgeEnabled?: boolean; coinsFor?: (price: number) => number } = {},
): Promise<Captured[]> {
  const captured: Captured[] = [];
  const badgeEnabled = opts.badgeEnabled !== false;
  const coinsFor = opts.coinsFor ?? ((p: number) => Math.floor((p / 100) * 5));

  await page.route(PREVIEW_GLOB, async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    const body = JSON.parse(route.request().postData() ?? '{}');
    captured.push(body);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify({
        status: 'ok',
        enabled: true,
        coins: coinsFor(Number(body.order_total_czk ?? 0)),
        reward_mode: 'whole_shop_with_exceptions',
        items: [],
        product_badge_enabled: badgeEnabled,
      }),
    });
  });
  return captured;
}

/** One real Shoptet listing card. */
const card = (sku: string, price: string) => `
  <div class="product">
    <div class="p" data-micro="product" data-micro-product-id="${sku}" data-testid="productItem">
      <a href="/x/" class="image"><img alt=""></a>
      <div class="p-in">
        <div class="p-in-in">
          <a href="/x/" class="name" data-micro="url"><span data-micro="name">Produkt ${sku}</span></a>
        </div>
        <div class="p-bottom single-button">
          <div data-micro="offer" data-micro-price="${price}" data-micro-price-currency="CZK">
            <div class="prices">
              <div class="price price-final" data-testid="productCardPrice"><strong>${price} Kč</strong></div>
            </div>
            <div class="p-tools"><a href="/x/" class="btn btn-primary">Detail</a></div>
          </div>
        </div>
      </div>
      <span class="p-code">Kód: <span data-micro="sku">${sku}</span></span>
    </div>
  </div>`;

const LISTING = `<div class="products" id="products">
  ${card('49396/FIA', '50.00')}
  ${card('DS99987700', '125.00')}
  ${card('DS99987699', '225.00')}
</div>`;

const CATEGORY_DL = JSON.stringify([{
  shoptet: { pageId: 12, pageType: 'category', currency: 'CZK', language: 'cs', projectId: 809915, category: 'Do domácnosti' },
}]);

async function mountListing(page: Page, body: string, dataLayer = CATEGORY_DL) {
  await page.route(SHOP_URL, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body:
        `<!doctype html><html lang="cs"><head><meta charset="utf-8"><title>kategorie</title>` +
        `<script>window.dataLayer = ${dataLayer};</script></head><body>` + body +
        `<script src="/shoptet-widget.js" data-onemil-partner="${PARTNER}" ` +
        `data-onemil-api="https://stub.invalid/functions/v1/partner-reward-preview"></script>` +
        `</body></html>`,
    });
  });
  await page.goto(SHOP_URL, { waitUntil: 'load' });
}

const badgeTexts = (page: Page) => page.$$eval('.onemil-mc-card', (n) => n.map((e) => e.textContent!.trim()));

test.describe('128 — MioCoin badge on listing cards', () => {

  test('128a) every card gets a badge, under the price, with the engine figure', async ({ page }) => {
    const captured = await stubPreview(page);
    await mountListing(page, LISTING);

    await expect.poll(() => badgeTexts(page).then((b) => b.length), { timeout: 10_000 }).toBe(3);

    // 50 -> 2, 125 -> 6, 225 -> 11 at 100 Kc = 5 MC.
    expect(await badgeTexts(page)).toEqual([
      'Získáte 2 MioCoiny',
      'Získáte 6 MioCoinů',
      'Získáte 11 MioCoinů',
    ]);

    // Real SKU and the clean data-micro-price must be what was sent.
    const sent = captured.map((c) => ({ code: c.items?.[0].code, price: c.items?.[0].unit_price_czk, total: c.order_total_czk }));
    expect(sent).toEqual(
      expect.arrayContaining([
        { code: '49396/FIA', price: 50, total: 50 },
        { code: 'DS99987700', price: 125, total: 125 },
        { code: 'DS99987699', price: 225, total: 225 },
      ]),
    );

    // Positioned under the price, inside the card's price block.
    const parentClass = await page.$eval('.onemil-mc-card', (e) => e.parentElement!.className);
    expect(parentClass).toContain('prices');
  });

  test('128b) product_badge_enabled=false shows nothing on the cards', async ({ page }) => {
    await stubPreview(page, { badgeEnabled: false });
    await mountListing(page, LISTING);
    await page.waitForTimeout(2_500);

    expect(await badgeTexts(page)).toEqual([]);
    await expect(page.locator('.onemil-mc-card')).toHaveCount(0);
  });

  test('128c) the same product+price is never requested twice', async ({ page }) => {
    // Same SKU twice (e.g. shown in two blocks) plus a repeat price on another SKU.
    const captured = await stubPreview(page);
    await mountListing(page, `<div class="products">
      ${card('DUP1', '310.00')}
      ${card('DUP1', '310.00')}
      ${card('OTHER', '310.00')}
    </div>`);

    await expect.poll(() => captured.length, { timeout: 10_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(2_500);

    const keys = captured.map((c) => `${c.items?.[0].code}|${c.items?.[0].unit_price_czk}`);
    expect(new Set(keys).size, 'each product+price asked once').toBe(keys.length);
    expect(keys.sort()).toEqual(['DUP1|310', 'OTHER|310']);
    // Both DUP1 cards still show the badge.
    expect((await badgeTexts(page)).length).toBe(3);
  });

  test('128d) badges are re-applied after an AJAX re-render (filter / paging)', async ({ page }) => {
    const captured = await stubPreview(page);
    await mountListing(page, LISTING);
    await expect.poll(() => badgeTexts(page).then((b) => b.length), { timeout: 10_000 }).toBe(3);
    const before = captured.length;

    // Shoptet replaces the product grid in place when filtering or paging.
    await page.evaluate((html) => {
      document.querySelector('#products')!.innerHTML = html;
    }, `${card('49396/FIA', '50.00')}${card('NEW-SKU', '775.00')}`);

    await expect.poll(() => badgeTexts(page).then((b) => b.length), { timeout: 10_000 }).toBe(2);
    expect(await badgeTexts(page)).toEqual(['Získáte 2 MioCoiny', 'Získáte 38 MioCoinů']);

    // The already-known product is repainted from cache; only the new one is fetched.
    const newCalls = captured.slice(before).map((c) => c.items?.[0].code);
    expect(newCalls).toEqual(['NEW-SKU']);
  });

  test('128e) painting badges does not trigger a request loop', async ({ page }) => {
    const captured = await stubPreview(page);
    await mountListing(page, LISTING);

    await expect.poll(() => captured.length, { timeout: 10_000 }).toBeGreaterThanOrEqual(3);
    await page.waitForTimeout(3_000);

    // 3 cards -> 3 card requests. Anything beyond a couple extra means the observer
    // is retriggering on our own DOM writes.
    expect(captured.length, `unexpected repeat requests: ${captured.length}`).toBeLessThanOrEqual(5);
  });

  test('128f) an empty cart on the page does not wipe the card badges', async ({ page }) => {
    await stubPreview(page);
    // A listing page that also has a (empty) cart container, as many templates do.
    await mountListing(page, `${LISTING}<div class="cart-content"><div class="cart-summary"></div></div>`);

    await expect.poll(() => badgeTexts(page).then((b) => b.length), { timeout: 10_000 }).toBe(3);
    await page.waitForTimeout(2_000);
    // updateCart() calls removeAll() when the basket is empty — it must only clear
    // its own cart badge, never the listing badges.
    expect((await badgeTexts(page)).length).toBe(3);
  });

  test('128g) cards without a code or price are skipped, not badged with nonsense', async ({ page }) => {
    const captured = await stubPreview(page);
    await mountListing(page, `<div class="products">
      ${card('GOOD', '100.00')}
      <div class="product"><div class="p" data-micro="product" data-testid="productItem">
        <div class="prices"><div class="price price-final">Cena na dotaz</div></div>
      </div></div>
    </div>`);

    await expect.poll(() => captured.length, { timeout: 10_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(2_000);

    expect(captured.map((c) => c.items?.[0].code)).toEqual(['GOOD']);
    expect((await badgeTexts(page)).length).toBe(1);
  });

  test('128h) approved look: short orange rule above orange text, price untouched', async ({ page }) => {
    await stubPreview(page);
    await mountListing(page, LISTING);
    await expect.poll(() => badgeTexts(page).then((b) => b.length), { timeout: 10_000 }).toBe(3);

    const look = await page.$eval('.onemil-mc-card', (el) => {
      const s = getComputedStyle(el);
      const rule = getComputedStyle(el, '::before');
      return {
        display: s.display,
        color: s.color,
        fontWeight: s.fontWeight,
        ruleWidth: rule.width,
        ruleHeight: rule.height,
        ruleBg: rule.backgroundColor,
        ruleDisplay: rule.display,
      };
    });

    // Variant 1: a short vivid brand-orange rule, then a stronger orange text line.
    expect(look.ruleDisplay).toBe('block');
    expect(look.ruleWidth).toBe('28px');
    expect(look.ruleHeight).toBe('3px');
    expect(look.ruleBg).toBe('rgb(255, 138, 0)');   // Energy Orange
    expect(look.color).toBe('rgb(189, 100, 0)');    // readable orange text
    expect(look.fontWeight).toBe('700');
    expect(look.display).toBe('block');

    // The shop's own price element must not be restyled by us.
    const priceColor = await page.$eval('.price-final', (el) => getComputedStyle(el).color);
    expect(priceColor).not.toBe('rgb(189, 100, 0)');
  });

  test('128i) badge wraps instead of overflowing on a narrow mobile card', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await stubPreview(page, { coinsFor: () => 1234 });
    await mountListing(page, LISTING);
    await expect.poll(() => badgeTexts(page).then((b) => b.length), { timeout: 10_000 }).toBe(3);

    // white-space:nowrap here would push the card (and the page) sideways.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(overflow, 'no horizontal overflow on mobile').toBeLessThanOrEqual(375);

    const ws = await page.$eval('.onemil-mc-card', (el) => getComputedStyle(el).whiteSpace);
    expect(ws).not.toBe('nowrap');
  });
});
