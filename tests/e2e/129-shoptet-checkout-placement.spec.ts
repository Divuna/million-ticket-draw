import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Spec 129 — the cart/checkout note must never live inside the shop's CTA.
 *
 * Real bug this locks out: on /objednavka/krok-1/ the checkout has no .cart-summary,
 * so the widget's fallback chain reached `.next-step-forward` — which IS the
 * "Pokračovat" control (an <a> in the basket, a <button> at checkout). The reward
 * text was appended INSIDE the shop's own button:
 *
 *   <button class="btn btn-lg btn-conversion next-step-forward">
 *     <span class="order-button-text">Pokračovat</span>
 *     <div class="onemil-mc-widget">Za tento nákup získáte…</div>   <- defaced the CTA
 *   </button>
 *
 * Markup below is copied from that real checkout. The widget must render as a
 * standalone element between the totals and the button block, and must never be a
 * descendant of a button, link, [role=button] or .btn.
 */

const PARTNER = '61c23960-7271-4c75-a1a4-dcb6e81b41ce';
const PREVIEW_GLOB = '**/partner-reward-preview';
const SHOP_URL = 'http://localhost:8080/__real_shoptet_checkout__';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function stubPreview(page: Page, coins = 2) {
  await page.route(PREVIEW_GLOB, async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify({
        status: 'ok', enabled: true, coins,
        reward_mode: 'whole_shop_with_exceptions', items: [], product_badge_enabled: true,
      }),
    });
  });
}

const CART_DL = (qty: number) => JSON.stringify([{
  shoptet: {
    pageType: 'cart', currency: 'CZK',
    cart: [{ code: '49396/ZEL', quantity: qty, priceWithVat: 50, priceWithoutDiscount: 60, name: 'Linteo' }],
  },
}]);

/** /kosik/ — .cart-summary present, CTA is an <a class="next-step-forward">. */
const BASKET_DOM = `
  <div class="cart-inner"><div class="row cart-row"><div class="col-md-8">
    <div class="cart-content">
      <div class="cart-summary">
        <div class="price-wrapper"><span class="price-label">Celkem za zboží:</span> <strong>50 Kč</strong></div>
      </div>
      <div class="next-step next-step--step-0">
        <a href="/objednavka/krok-1/" class="btn btn-lg btn-conversion next-step-forward">Pokračovat</a>
        <a href="/" class="btn next-step-back">Zpět do obchodu</a>
      </div>
    </div>
  </div></div></div>`;

/** /objednavka/krok-1/ — NO .cart-summary, CTA is a <button class="next-step-forward">. */
const CHECKOUT_DOM = `
  <div class="cart-inner"><div class="row cart-row"><div id="checkoutSidebar" class="col-md-4">
    <div class="cart-content">
      <div class="order-summary"><div class="order-summary-inner" id="summary-box">
        <div class="order-summary-item price"><div class="price-wrapper">
          <span class="price-label price-primary">Celkem k úhradě</span><strong>50 Kč</strong>
        </div></div>
      </div></div>
      <div class="next-step next-step--step-1">
        <a href="/kosik/" class="btn btn-lg next-step-back">Zpět</a>
        <button type="submit" form="order-form" id="orderFormButton"
                class="btn btn-lg btn-conversion next-step-forward">
          <span class="order-button-text">Pokračovat</span>
        </button>
      </div>
    </div>
  </div></div></div>`;

/** Worst case: no .next-step wrapper at all, only the bare CTA. */
const BARE_CTA_DOM = `
  <div class="cart-content">
    <div class="order-summary"><span class="price-label">Celkem k úhradě</span> 50 Kč</div>
    <button id="orderFormButton" class="btn btn-lg btn-conversion next-step-forward">Pokračovat</button>
  </div>`;

async function mount(page: Page, body: string, dataLayer = CART_DL(1)) {
  await page.route(SHOP_URL, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body:
        `<!doctype html><html lang="cs"><head><meta charset="utf-8"><title>checkout</title>` +
        `<script>window.dataLayer = ${dataLayer};</script></head><body>` + body +
        `<script src="/shoptet-widget.js" data-onemil-partner="${PARTNER}" ` +
        `data-onemil-api="https://stub.invalid/functions/v1/partner-reward-preview"></script>` +
        `</body></html>`,
    });
  });
  await page.goto(SHOP_URL, { waitUntil: 'load' });
}

/** The invariant, checked the same way everywhere. */
async function assertOutsideCta(page: Page) {
  const r = await page.$eval('.onemil-mc-widget', (el) => {
    const cta = el.closest('button, a, [role="button"], .btn, .next-step-forward, .next-step-back');
    return {
      insideCta: !!cta,
      ctaDesc: cta ? `${cta.tagName}.${String(cta.className)}` : null,
      parentTag: el.parentElement!.tagName,
    };
  });
  expect(r.insideCta, `widget must not sit inside the shop's CTA (found in ${r.ctaDesc})`).toBe(false);
  expect(['BUTTON', 'A']).not.toContain(r.parentTag);
}

test.describe('129 — checkout placement never touches the shop CTA', () => {

  test('129a) basket: renders outside the CTA, above the button block', async ({ page }) => {
    await stubPreview(page);
    await mount(page, BASKET_DOM);
    await expect(page.locator('.onemil-mc-widget')).toContainText('Dárek od nás: 2 MioCoiny do soutěží OneMil');

    await assertOutsideCta(page);

    // Positioned before the whole .next-step block, i.e. above the buttons.
    const above = await page.$eval('.onemil-mc-widget', (el) => {
      const ns = document.querySelector('.next-step')!;
      return (el.compareDocumentPosition(ns) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    });
    expect(above, 'note belongs above the buttons').toBe(true);
  });

  test('129b) checkout step: the exact case that used to land inside the button', async ({ page }) => {
    await stubPreview(page);
    await mount(page, CHECKOUT_DOM);
    await expect(page.locator('.onemil-mc-widget')).toContainText('Dárek od nás: 2 MioCoiny do soutěží OneMil');

    await assertOutsideCta(page);

    // The shop's button keeps exactly its own content.
    const btn = await page.$eval('#orderFormButton', (el) => ({
      text: el.textContent!.trim(),
      children: el.children.length,
      hasWidget: !!el.querySelector('.onemil-mc-widget'),
    }));
    expect(btn.hasWidget, 'the CTA must not contain our node').toBe(false);
    expect(btn.text).toBe('Pokračovat');
    expect(btn.children).toBe(1); // just <span class="order-button-text">

    // Between the totals and the buttons.
    const order = await page.$eval('.onemil-mc-widget', (el) => {
      const summary = document.querySelector('.order-summary')!;
      const ns = document.querySelector('.next-step')!;
      return {
        afterSummary: (summary.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
        beforeButtons: (el.compareDocumentPosition(ns) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      };
    });
    expect(order.afterSummary, 'below "Celkem k úhradě"').toBe(true);
    expect(order.beforeButtons, 'above "Pokračovat"').toBe(true);
  });

  test('129c) even with no .next-step wrapper it stays out of the bare CTA', async ({ page }) => {
    await stubPreview(page);
    await mount(page, BARE_CTA_DOM);
    await expect(page.locator('.onemil-mc-widget')).toContainText('Dárek od nás: 2 MioCoiny do soutěží OneMil');

    await assertOutsideCta(page);
    const inBtn = await page.$eval('#orderFormButton', (el) => !!el.querySelector('.onemil-mc-widget'));
    expect(inBtn).toBe(false);
  });

  test('129d) discreet styling — no branded pill in a stranger\'s checkout', async ({ page }) => {
    await stubPreview(page);
    await mount(page, CHECKOUT_DOM);
    await expect(page.locator('.onemil-mc-widget')).toBeVisible();

    const s = await page.$eval('.onemil-mc-widget', (el) => {
      const c = getComputedStyle(el);
      return { bg: c.backgroundColor, bgImage: c.backgroundImage, color: c.color, border: c.borderTopWidth };
    });
    // Transparent, no gradient, no border — it must read as the shop's own info
    // line, not as an advert pasted over their design.
    expect(s.bgImage).toBe('none');
    expect(s.bg).toBe('rgba(0, 0, 0, 0)');
    expect(s.border).toBe('0px');
    // Body text is dark; only the amount carries the OneMil accent.
    expect(s.color).toBe('rgb(46, 46, 46)');

    const val = await page.$eval('.onemil-mc-widget-val', (el) => ({
      color: getComputedStyle(el).color,
      text: el.textContent!.trim(),
    }));
    expect(val.color, 'the amount is the only highlighted part').toBe('rgb(189, 100, 0)');
    expect(val.text).toBe('2 MioCoiny');

    // Outline gift glyph: thin dark stroke, no fill, no background of its own.
    const gift = await page.$eval('.onemil-mc-widget-gift', (el) => {
      const c = getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        w: parseFloat(c.width),
        h: parseFloat(c.height),
        fill: el.getAttribute('fill'),
        stroke: el.getAttribute('stroke'),
        strokeWidth: el.getAttribute('stroke-width'),
        color: c.color,
        bg: c.backgroundColor,
        ariaHidden: el.getAttribute('aria-hidden'),
      };
    });
    expect(gift.tag).toBe('svg');
    expect(gift.fill, 'outline only — never filled').toBe('none');
    expect(gift.stroke).toBe('currentColor');
    expect(parseFloat(gift.strokeWidth!)).toBeLessThanOrEqual(2);
    expect(gift.w).toBeGreaterThanOrEqual(24);
    expect(gift.w).toBeLessThanOrEqual(28);
    expect(gift.h).toBe(gift.w);
    expect(gift.color, 'dark stroke, not orange').toBe('rgb(51, 51, 51)');
    expect(gift.bg).toBe('rgba(0, 0, 0, 0)');
    expect(gift.ariaHidden).toBe('true');

    // Original MioCoin artwork, immediately before the amount.
    // naturalWidth is 0 until the file has actually decoded, so wait for it rather
    // than racing the render.
    await expect
      .poll(() => page.$eval('.onemil-mc-widget img', (el) => (el as HTMLImageElement).naturalWidth),
        { timeout: 10_000 })
      .toBeGreaterThan(0);

    const ico = await page.$eval('.onemil-mc-widget img', (el) => {
      const c = getComputedStyle(el);
      const img = el as HTMLImageElement;
      return {
        src: img.getAttribute('src'), w: parseFloat(c.width),
        natural: img.naturalWidth, alt: img.getAttribute('alt'),
        nextIsValue: (img.nextElementSibling as HTMLElement | null)?.className ?? '',
      };
    });
    expect(ico.src).toContain('miocoin-icon.png');
    expect(ico.w).toBeGreaterThanOrEqual(16);
    expect(ico.w).toBeLessThanOrEqual(18);
    expect(ico.natural, 'icon must load').toBeGreaterThan(0);
    expect(ico.alt).toBe('');
    expect(ico.nextIsValue, 'coin sits right before the amount').toContain('-val');

    // Reading order: gift glyph, then the sentence.
    const firstChild = await page.$eval('.onemil-mc-widget',
      (el) => el.firstElementChild!.tagName.toLowerCase());
    expect(firstChild).toBe('svg');

    // The word "přibližně" was deliberately dropped from this copy.
    const full = await page.$eval('.onemil-mc-widget', (el) => el.textContent!.trim());
    expect(full).toBe('Dárek od nás: 2 MioCoiny do soutěží OneMil');
    expect(full).not.toContain('přibližně');
  });

  test('129e) the shop\'s own CTA styling is left completely alone', async ({ page }) => {
    // Baseline the button BEFORE the widget can touch anything.
    await page.route(PREVIEW_GLOB, (route) => route.abort());
    await mount(page, CHECKOUT_DOM);
    const before = await page.$eval('#orderFormButton', (el) => {
      const c = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), bg: c.backgroundColor, cls: el.className };
    });

    await page.unrouteAll();
    await stubPreview(page);
    await mount(page, CHECKOUT_DOM);
    await expect(page.locator('.onemil-mc-widget')).toBeVisible();

    const after = await page.$eval('#orderFormButton', (el) => {
      const c = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), bg: c.backgroundColor, cls: el.className };
    });

    expect(after.w).toBe(before.w);
    expect(after.h, 'the CTA must not grow — that was the visible symptom').toBe(before.h);
    expect(after.bg).toBe(before.bg);
    expect(after.cls).toBe(before.cls);
  });

  test('129f) mobile: still outside the CTA and no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await stubPreview(page, 1234);
    await mount(page, CHECKOUT_DOM);
    await expect(page.locator('.onemil-mc-widget')).toBeVisible();

    await assertOutsideCta(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(overflow).toBeLessThanOrEqual(375);
  });
});
