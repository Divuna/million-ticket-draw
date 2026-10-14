/**
 * Live proof of the listing-card badges on the REAL Shoptet storefront.
 * Manual run: node tests/live/shoptet-live-listing.mjs
 */
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const SHOP = 'https://809915.myshoptet.com';
const WIDGET = readFileSync(resolve('public/shoptet-widget.js'), 'utf8');
const ICON = readFileSync(resolve('public/miocoin-icon.png'));

const browser = await chromium.launch();
const page = await browser.newPage();
// The icon is not published yet, so serve the local copy too.
await page.route('https://onemil.cz/miocoin-icon.png', (r) =>
  r.fulfill({ status: 200, contentType: 'image/png', body: ICON }));
await page.route('https://onemil.cz/shoptet-widget.js', (r) =>
  r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: WIDGET }));

const calls = [];
page.on('request', (r) => {
  if (r.url().includes('partner-reward-preview') && r.method() === 'POST') calls.push(JSON.parse(r.postData() ?? '{}'));
});

await page.goto(`${SHOP}/do-domacnosti/`, { waitUntil: 'domcontentloaded' });
await page.click('text=Odmítnout').catch(()=>{});
 await page.waitForTimeout(1000);
 await page.evaluate(()=>window.scrollTo(0,420));
 await page.waitForTimeout(3500);

const badges = await page.$$eval('.onemil-mc-card', (n) => n.map((e) => e.textContent.trim()));
const cards = await page.$$eval('.p[data-micro="product"]', (n) => n.map((c) => ({
  sku: (c.querySelector('[data-micro="sku"]') || {}).textContent?.trim(),
  price: (c.querySelector('[data-micro-price]') || {}).getAttribute?.('data-micro-price'),
  badge: (c.querySelector('.onemil-mc-card') || {}).textContent?.trim() ?? null,
})));

console.log('CARDS ON LISTING:');
cards.forEach((c) => console.log(`  ${String(c.sku).padEnd(14)} ${String(c.price).padEnd(8)} -> ${c.badge}`));
console.log(`BADGES RENDERED : ${badges.length}`);
console.log(`REQUESTS SENT   : ${calls.length}`);

mkdirSync('test-results', { recursive: true });
await page.screenshot({ path: 'test-results/live-shoptet-listing.png', fullPage: false });

// MOBILE check
await page.setViewportSize({ width: 375, height: 812 });
await page.waitForTimeout(1500);
await page.evaluate(()=>window.scrollTo(0,520));
await page.waitForTimeout(1500);
const overflow = await page.evaluate(()=>document.documentElement.scrollWidth);
console.log('MOBILE scrollWidth (must be <=375):', overflow);
await page.screenshot({ path: 'test-results/live-shoptet-listing-mobile.png', fullPage: false });
console.log('screenshot: test-results/live-shoptet-listing.png');
await browser.close();
