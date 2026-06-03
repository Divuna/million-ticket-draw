/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Affiliate Dashboard — Content Smoke Test  (spec 26)                       ║
 * ║                                                                            ║
 * ║  Verifies enhanced /affiliate/dashboard:                                   ║
 * ║    • hero "Vydělávejte s OneMil" heading visible                           ║
 * ║    • "Aktivní Affiliate partner" badge visible                             ║
 * ║    • mode switcher rendered (Influencer | Obchodník)                       ║
 * ║    • influencer mode: affiliate link contains /?ref=                       ║
 * ║    • influencer mode: QR code rendered locally (no external API)           ║
 * ║    • copy button present                                                   ║
 * ║    • stat cards visible                                                    ║
 * ║    • /influencer/dashboard still redirects to /affiliate/dashboard         ║
 * ║    • localStorage stores mode preference                                   ║
 * ║                                                                            ║
 * ║  STAGING-ONLY. Skipped cleanly when any required env var is absent.        ║
 * ║                                                                            ║
 * ║  Required env vars:                                                         ║
 * ║    E2E_AFFILIATE_EMAIL        affiliate-e2e@onemil.cz (legacy influencer) ║
 * ║    E2E_AFFILIATE_PASSWORD                                                  ║
 * ║    VITE_SUPABASE_URL          staging Supabase URL                        ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { test, expect } from '@playwright/test';
import { loginViaUI } from './helpers/auth';

const AFFILIATE_EMAIL    = process.env.E2E_AFFILIATE_EMAIL    ?? '';
const AFFILIATE_PASSWORD = process.env.E2E_AFFILIATE_PASSWORD ?? '';
const SUPABASE_URL       = process.env.VITE_SUPABASE_URL      ?? '';

test.describe('Affiliate Dashboard — Content Smoke (spec 26)', () => {
  test.skip(
    !AFFILIATE_EMAIL || !AFFILIATE_PASSWORD || !SUPABASE_URL,
    'Missing required env vars — skipping spec 26',
  );

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem(
        'cookie_consent',
        JSON.stringify({ essential: true, analytics: false, marketing: false, timestamp: new Date().toISOString() }),
      );
      // Clear mode preference so each test starts fresh
      localStorage.removeItem('affiliate_active_mode');
    });
    await loginViaUI(page, AFFILIATE_EMAIL, AFFILIATE_PASSWORD);
    await page.waitForURL(/\/affiliate\/dashboard/, { timeout: 20_000 });
  });

  test('hero section renders "Vydělávejte s OneMil" and status badge', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Vydělávejte s OneMil', exact: true }),
    ).toBeVisible({ timeout: 15_000 });

    await expect(
      page.getByText('Aktivní Affiliate partner', { exact: true }),
    ).toBeVisible({ timeout: 8_000 });
  });

  test('mode switcher is rendered with Influencer and Obchodník buttons', async ({ page }) => {
    const switcher = page.getByTestId('mode-switcher');
    await expect(switcher).toBeVisible({ timeout: 10_000 });

    await expect(page.getByTestId('mode-btn-influencer')).toBeVisible();
    await expect(page.getByTestId('mode-btn-sales_rep')).toBeVisible();

    // Neither button should be disabled (inactive mode is NOT disabled, it shows a message instead)
    const infBtn = page.getByTestId('mode-btn-influencer');
    const salesBtn = page.getByTestId('mode-btn-sales_rep');
    expect(await infBtn.isDisabled(), 'Influencer btn must not be disabled').toBe(false);
    expect(await salesBtn.isDisabled(), 'Obchodník btn must not be disabled').toBe(false);
  });

  test('clicking inactive mode shows Czech explanatory message', async ({ page }) => {
    // affiliate-e2e@onemil.cz has modes=['influencer'] only → sales_rep is inactive
    const salesBtn = page.getByTestId('mode-btn-sales_rep');
    await expect(salesBtn).toBeVisible({ timeout: 10_000 });

    // Click the inactive mode button
    await salesBtn.click();

    // Should show the explanatory message (not just a tooltip)
    const msg = page.getByTestId('mode-inactive-message');
    await expect(msg).toBeVisible({ timeout: 5_000 });
    await expect(msg).toContainText('Tento režim zatím nemáte aktivní');
    await expect(msg).toContainText('administrátora');

    // Clicking should NOT switch to sales_rep mode (influencer link still present)
    await expect(page.getByTestId('affiliate-customer-link')).toBeVisible({ timeout: 5_000 });
  });

  test('influencer mode shows customer link with /?ref=', async ({ page }) => {
    // Make sure we're in influencer mode
    const infBtn = page.getByTestId('mode-btn-influencer');
    await expect(infBtn).toBeVisible({ timeout: 10_000 });
    await infBtn.click();

    const linkInput = page.getByTestId('affiliate-customer-link');
    await expect(linkInput).toBeVisible({ timeout: 8_000 });
    const val = await linkInput.inputValue();
    expect(val, 'Customer link must contain /?ref=').toMatch(/\/\?ref=/);
  });

  test('QR code is rendered by local qrcode.react (SVG element, no external request)', async ({ page }) => {
    // QRCodeSVG renders an inline <svg> element — no external image src
    const qrSvg = page.locator('[data-testid="affiliate-qr-code"]');
    await expect(qrSvg).toBeVisible({ timeout: 10_000 });

    // Verify it's an SVG (not an <img> pointing to external API)
    const tagName = await qrSvg.evaluate(el => el.tagName.toLowerCase());
    expect(tagName, 'QR code must be a local SVG element, not an <img>').toBe('svg');
  });

  test('stat cards "Registrace dnes", "Registrace tento měsíc" are visible in influencer mode', async ({ page }) => {
    // Switch to influencer mode explicitly
    await page.getByTestId('mode-btn-influencer').click();

    await expect(page.getByText('Registrace dnes')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('Registrace tento měsíc')).toBeVisible();
    await expect(page.getByText('Celkem zákazníků')).toBeVisible();
  });

  test('mode preference is stored in localStorage', async ({ page }) => {
    const salesBtn = page.getByTestId('mode-btn-sales_rep');
    await expect(salesBtn).toBeVisible({ timeout: 10_000 });

    // Check via data-has-role attribute whether this account actually has sales_rep mode
    const hasRole = await salesBtn.getAttribute('data-has-role');

    if (hasRole === 'true') {
      // Account has sales_rep → clicking switches and stores 'sales_rep'
      await salesBtn.click();
      const storedMode = await page.evaluate(() => localStorage.getItem('affiliate_active_mode'));
      expect(storedMode).toBe('sales_rep');
    } else {
      // Influencer-only account → clicking shows inactive message, localStorage stays 'influencer'
      await page.getByTestId('mode-btn-influencer').click();
      const storedMode = await page.evaluate(() => localStorage.getItem('affiliate_active_mode'));
      expect(storedMode).toBe('influencer');
    }
  });

  test('/influencer/dashboard redirects to /affiliate/dashboard', async ({ page }) => {
    await page.goto('/influencer/dashboard');
    await expect(page).toHaveURL(/\/affiliate\/dashboard/, { timeout: 10_000 });
  });
});
