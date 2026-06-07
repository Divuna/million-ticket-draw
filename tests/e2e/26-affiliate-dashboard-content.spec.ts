/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Affiliate Dashboard — Content Smoke Test  (spec 26)                       ║
 * ║                                                                            ║
 * ║  Verifies enhanced /affiliate/dashboard:                                   ║
 * ║    • hero "Vydělávejte s OneMil" heading visible                           ║
 * ║    • "Aktivní Affiliate partner" badge visible                             ║
 * ║    • mode switcher rendered (Influencer | Obchodník | Profil)              ║
 * ║    • influencer mode: affiliate link contains /?ref=                       ║
 * ║    • sales mode: company link contains /partner/register?via=              ║
 * ║    • both links use the same ref_code                                      ║
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
import { loginAffiliateViaUI } from './helpers/auth';

const AFFILIATE_EMAIL    = process.env.E2E_AFFILIATE_EMAIL    ?? '';
const AFFILIATE_PASSWORD = process.env.E2E_AFFILIATE_PASSWORD ?? '';
const SUPABASE_URL       = process.env.VITE_SUPABASE_URL      ?? '';
const PUBLIC_APP_URL     = 'https://onemil.cz';

const getParam = (value: string, param: 'ref' | 'via') => new URL(value).searchParams.get(param);

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
    await loginAffiliateViaUI(page, AFFILIATE_EMAIL, AFFILIATE_PASSWORD);
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

  test('mode switcher is rendered with Influencer, Obchodník and Profil buttons', async ({ page }) => {
    const switcher = page.getByTestId('mode-switcher');
    await expect(switcher).toBeVisible({ timeout: 10_000 });

    await expect(page.getByTestId('mode-btn-influencer')).toBeVisible();
    await expect(page.getByTestId('mode-btn-sales_rep')).toBeVisible();
    await expect(page.getByTestId('mode-btn-profile')).toBeVisible();

    // Both sections are always available for every approved Affiliate account.
    const infBtn = page.getByTestId('mode-btn-influencer');
    const salesBtn = page.getByTestId('mode-btn-sales_rep');
    const profileBtn = page.getByTestId('mode-btn-profile');
    expect(await infBtn.isDisabled(), 'Influencer btn must not be disabled').toBe(false);
    expect(await salesBtn.isDisabled(), 'Obchodník btn must not be disabled').toBe(false);
    expect(await profileBtn.isDisabled(), 'Profil btn must not be disabled').toBe(false);
  });

  test('profile mode shows profile section exactly once', async ({ page }) => {
    await page.getByTestId('mode-btn-profile').click();

    const profileTitle = page.getByText('Profil a výplatní údaje', { exact: true });
    await expect(profileTitle).toBeVisible({ timeout: 8_000 });
    await expect(profileTitle).toHaveCount(1);
    await expect(page.getByText('Podmínky spolupráce', { exact: true })).toBeVisible();
  });

  test('profile mode shows registration data summary', async ({ page }) => {
    await page.getByTestId('mode-btn-profile').click();
    await expect(page.getByText('Sociální sítě a dosah', { exact: true })).toBeVisible({ timeout: 8_000 });

    await expect(page.getByText('Hlavní kanál / web / profil', { exact: true })).toBeVisible();
    await expect(page.getByText('Instagram', { exact: true })).toBeVisible();
    await expect(page.getByText('TikTok', { exact: true })).toBeVisible();
    await expect(page.getByText('YouTube', { exact: true })).toBeVisible();
    await expect(page.getByText('Facebook', { exact: true })).toBeVisible();
    await expect(page.getByText('Velikost publika / dosah', { exact: true })).toBeVisible();
    await expect(page.getByText('Kategorie obsahu', { exact: true })).toBeVisible();
    await expect(page.getByTestId('affiliate-profile-modes')).toContainText(/Influencer|Obchodník/);
    await expect(page.getByTestId('affiliate-profile-ref-code')).not.toContainText('Neuvedeno');
    await expect(page.getByTestId('affiliate-profile-status')).toContainText('Schváleno');
    await expect(page.getByTestId('affiliate-profile-email-summary')).toContainText(AFFILIATE_EMAIL);
  });

  test('influencer and sales modes do not show profile section', async ({ page }) => {
    await page.getByTestId('mode-btn-influencer').click();
    await expect(page.getByText('Profil a výplatní údaje', { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('affiliate-customer-link')).toBeVisible({ timeout: 8_000 });

    await page.getByTestId('mode-btn-sales_rep').click();
    await expect(page.getByText('Profil a výplatní údaje', { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('affiliate-company-link')).toBeVisible({ timeout: 8_000 });
  });

  test('sales mode shows company link with /partner/register?via= and no inactive message', async ({ page }) => {
    const salesBtn = page.getByTestId('mode-btn-sales_rep');
    await expect(salesBtn).toBeVisible({ timeout: 10_000 });

    await salesBtn.click();

    await expect(page.getByTestId('mode-inactive-message')).toHaveCount(0);
    const linkInput = page.getByTestId('affiliate-company-link');
    await expect(linkInput).toBeVisible({ timeout: 8_000 });
    const val = await linkInput.inputValue();
    expect(val, 'Company link must use production origin').toMatch(/^https:\/\/onemil\.cz\/partner\/register\?via=/);
    expect(val, 'Company link must not use Lovable preview or localhost').not.toMatch(/lovable|preview--|localhost|127\.0\.0\.1/i);
  });

  test('influencer mode shows customer link with /?ref=', async ({ page }) => {
    // Make sure we're in influencer mode
    const infBtn = page.getByTestId('mode-btn-influencer');
    await expect(infBtn).toBeVisible({ timeout: 10_000 });
    await infBtn.click();

    const linkInput = page.getByTestId('affiliate-customer-link');
    await expect(linkInput).toBeVisible({ timeout: 8_000 });
    const val = await linkInput.inputValue();
    expect(val, 'Customer link must use production origin').toMatch(/^https:\/\/onemil\.cz\/\?ref=/);
    expect(val, 'Customer link must not use Lovable preview or localhost').not.toMatch(/lovable|preview--|localhost|127\.0\.0\.1/i);
  });

  test('customer and company sections use the same ref_code', async ({ page }) => {
    await page.getByTestId('mode-btn-influencer').click();
    const customerLink = await page.getByTestId('affiliate-customer-link').inputValue();
    const customerCode = getParam(customerLink, 'ref');

    await page.getByTestId('mode-btn-sales_rep').click();
    const companyInput = page.getByTestId('affiliate-company-link');
    await expect(companyInput).toBeVisible({ timeout: 8_000 });
    const companyLink = await companyInput.inputValue();
    const companyCode = getParam(companyLink, 'via');

    expect(customerCode, 'Customer ref code must exist').toBeTruthy();
    expect(companyCode, 'Company via code must exist').toBeTruthy();
    expect(companyCode).toBe(customerCode);
    expect(customerLink).toBe(`${PUBLIC_APP_URL}/?ref=${customerCode}`);
    expect(companyLink).toBe(`${PUBLIC_APP_URL}/partner/register?via=${companyCode}`);
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

  test('sales mode shows company stats and Moje firmy section', async ({ page }) => {
    await page.getByTestId('mode-btn-sales_rep').click();

    await expect(page.getByText('Firmy dnes')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('Firmy (30 dní)')).toBeVisible();
    await expect(page.getByText('Celkem firem')).toBeVisible();
    await expect(page.getByText('Moje firmy')).toBeVisible();
  });

  test('mode preference is stored in localStorage', async ({ page }) => {
    const salesBtn = page.getByTestId('mode-btn-sales_rep');
    await expect(salesBtn).toBeVisible({ timeout: 10_000 });

    await salesBtn.click();
    await expect(page.getByTestId('affiliate-company-link')).toBeVisible({ timeout: 8_000 });
    let storedMode = await page.evaluate(() => localStorage.getItem('affiliate_active_mode'));
    expect(storedMode).toBe('sales_rep');

    await page.getByTestId('mode-btn-influencer').click();
    await expect(page.getByTestId('affiliate-customer-link')).toBeVisible({ timeout: 8_000 });
    storedMode = await page.evaluate(() => localStorage.getItem('affiliate_active_mode'));
    expect(storedMode).toBe('influencer');

    await page.getByTestId('mode-btn-profile').click();
    await expect(page.getByText('Profil a výplatní údaje', { exact: true })).toBeVisible({ timeout: 8_000 });
    storedMode = await page.evaluate(() => localStorage.getItem('affiliate_active_mode'));
    expect(storedMode).toBe('profile');
  });

  test('/influencer/dashboard redirects to /affiliate/dashboard', async ({ page }) => {
    await page.goto('/influencer/dashboard');
    await expect(page).toHaveURL(/\/affiliate\/dashboard/, { timeout: 10_000 });
  });
});
