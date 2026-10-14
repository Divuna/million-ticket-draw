/**
 * Live proof of the cart/checkout note on the REAL Shoptet checkout.
 * Manual run: node tests/live/shoptet-live-checkout.mjs
 */
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const SHOP = 'https://809915.myshoptet.com';
const WIDGET = readFileSync(resolve('public/shoptet-widget.js'), 'utf8');
const ICON = readFileSync(resolve('public/miocoin-icon.png'));
const MOBILE = process.argv.includes('--mobile');

const b = await chromium.launch();
const p = await b.newPage(MOBILE ? { viewport: { width: 375, height: 812 } } : {});
await p.route('https://onemil.cz/miocoin-icon.png', r => r.fulfill({ status:200, contentType:'image/png', body:ICON }));
await p.route('https://onemil.cz/shoptet-widget.js', r => r.fulfill({ status:200, contentType:'text/javascript; charset=utf-8', body:WIDGET }));

await p.goto(`${SHOP}/linteo-box-kapesniku/`, { waitUntil:'domcontentloaded' });
await p.click('text=Odmítnout').catch(()=>{});
await p.selectOption('#simple-variants-select', { index: 1 }).catch(()=>{});
await p.click('#product-detail-form button[type="submit"]').catch(()=>{});
await p.waitForTimeout(2500);

mkdirSync('test-results', { recursive: true });
const tag = MOBILE ? 'mobile' : 'desktop';

async function check(label, file) {
  await p.waitForTimeout(3500);
  const r = await p.evaluate(() => {
    const w = document.querySelector('.onemil-mc-widget');
    if (!w) return { found:false };
    const cta = w.closest('button, a, [role="button"], .btn, .next-step-forward');
    const nextStep = document.querySelector('.next-step');
    const s = getComputedStyle(w);
    return {
      found:true,
      text: w.textContent.trim(),
      INSIDE_CTA: !!cta,
      parent: `${w.parentElement.tagName.toLowerCase()}.${String(w.parentElement.className).trim().split(/\s+/).slice(0,3).join('.')}`,
      aboveButtons: nextStep ? (w.compareDocumentPosition(nextStep) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 : null,
      bg: s.backgroundColor, bgImg: s.backgroundImage, color: s.color,
      hasIcon: !!w.querySelector('img'), hasGift: !!w.querySelector('svg'), giftStroke: w.querySelector('svg')?getComputedStyle(w.querySelector('svg')).color:null, giftW: w.querySelector('svg')?Math.round(w.querySelector('svg').getBoundingClientRect().width):null, valColor: w.querySelector('.onemil-mc-widget-val')?getComputedStyle(w.querySelector('.onemil-mc-widget-val')).color:null,
      overflow: document.documentElement.scrollWidth,
    };
  });
  console.log(`${label.padEnd(20)} ${JSON.stringify(r)}`);
  await p.screenshot({ path:`test-results/checkout-${file}-${tag}.png` });
}

await p.goto(`${SHOP}/kosik/`, { waitUntil:'domcontentloaded' });
await check('1 kosik', 'cart');

await p.click('.next-step-forward').catch(()=>{});
await p.waitForTimeout(3000);
await check('2 doprava/platba', 'shipping');

await p.evaluate(() => { const r=document.querySelector('input[name*="shipping"]'); if(r) r.click(); });
await p.evaluate(() => { const r=document.querySelector('input[name*="payment"]'); if(r) r.click(); });
await p.waitForTimeout(2500);
await check('3 po volbe', 'final');

await b.close();
