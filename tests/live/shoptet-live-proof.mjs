/**
 * Live proof against the REAL Shoptet storefront (809915.myshoptet.com).
 *
 * Not part of the automated suite — it depends on a live third-party shop. Run it
 * by hand when the Shoptet template changes:
 *
 *   node tests/live/shoptet-live-proof.mjs
 *
 * It intercepts https://onemil.cz/shoptet-widget.js and serves the LOCAL file, so
 * what you see is exactly what the repo would publish. The partner's own snippet
 * in the shop footer is what loads it, so this exercises the real integration.
 */
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const SHOP = 'https://809915.myshoptet.com';
const PRODUCT = `${SHOP}/linteo-box-kapesniku/`;
const CART = `${SHOP}/kosik/`;
const WIDGET = readFileSync(resolve('public/shoptet-widget.js'), 'utf8');

const out = (m) => console.log(m);

const browser = await chromium.launch();
const page = await browser.newPage();

// Serve the local widget in place of the published one.
await page.route('https://onemil.cz/shoptet-widget.js', (route) =>
  route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: WIDGET }),
);

const calls = [];
page.on('request', (r) => {
  if (r.url().includes('partner-reward-preview') && r.method() === 'POST') {
    calls.push(JSON.parse(r.postData() ?? '{}'));
  }
});

// ── product detail ─────────────────────────────────────────────────────────────
await page.goto(PRODUCT, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
const badge = await page.locator('.onemil-mc-widget').first().textContent().catch(() => null);
out(`PRODUCT BADGE : ${badge ? badge.trim() : '(none)'}`);
mkdirSync('test-results', { recursive: true });
await page.screenshot({ path: 'test-results/live-shoptet-product.png', fullPage: false });

// ── add to cart ────────────────────────────────────────────────────────────────
await page.selectOption('#simple-variants-select', { index: 1 }).catch(() => {});
await page.click('#product-detail-form button[type="submit"]').catch(() => {});
await page.waitForTimeout(2500);

// ── cart ───────────────────────────────────────────────────────────────────────
await page.goto(CART, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);
const cartLine = await page.locator('.onemil-mc-widget').first().textContent().catch(() => null);
out(`CART LINE     : ${cartLine ? cartLine.trim() : '(none)'}`);

const cart = await page.evaluate(() => {
  const e = (window.dataLayer || []).slice().reverse().find((x) => x && x.shoptet && x.shoptet.cart);
  return e ? e.shoptet.cart.map((i) => ({ code: i.code, qty: i.quantity, price: i.priceWithVat })) : null;
});
out(`REAL CART     : ${JSON.stringify(cart)}`);
out(`PAYLOADS SENT : ${JSON.stringify(calls.slice(-2), null, 1)}`);
await page.screenshot({ path: 'test-results/live-shoptet-cart.png', fullPage: false });

out('screenshots: test-results/live-shoptet-product.png, test-results/live-shoptet-cart.png');
await browser.close();
