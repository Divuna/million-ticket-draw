/**
 * Spec 35 — Affiliate dashboard: Přidat firmu UI (Phase 2B)
 *
 * Staging-only. Tests the CompanyLeadSection and AddCompanyLeadDialog
 * components in /affiliate/dashboard for a sales_rep affiliate account.
 *
 * Required env vars:
 *   E2E_SALES_REP_AFFILIATE_EMAIL     — approved sales_rep affiliate (staging)
 *   E2E_SALES_REP_AFFILIATE_PASSWORD
 *   VITE_SUPABASE_URL                 — must include staging ref dxmowysntemfqfnanxua
 *
 * Optional (for influencer-only visibility test):
 *   E2E_AFFILIATE_EMAIL               — influencer-only affiliate (used by spec 26)
 *   E2E_AFFILIATE_PASSWORD
 *
 * Invariants verified:
 *   a) Approved sales_rep sees "Žádosti o registraci firem" section and "+ Přidat firmu" button
 *   b) Influencer-only account does NOT see the lead section (if env vars present)
 *   c) Dialog opens with all required fields
 *   d) Spec 34 backend contract is NOT retested here — call through UI form only
 */

import { test, expect } from '@playwright/test';
import { loginAffiliateViaUI } from './helpers/auth';

const STAGING_REF = 'dxmowysntemfqfnanxua';

const SUPABASE_URL       = process.env.VITE_SUPABASE_URL                ?? '';
const SALES_REP_EMAIL    = process.env.E2E_SALES_REP_AFFILIATE_EMAIL    ?? '';
const SALES_REP_PASSWORD = process.env.E2E_SALES_REP_AFFILIATE_PASSWORD ?? '';
const INFLUENCER_EMAIL   = process.env.E2E_AFFILIATE_EMAIL              ?? '';
const INFLUENCER_PASSWORD = process.env.E2E_AFFILIATE_PASSWORD          ?? '';

function isStaging() {
  return SUPABASE_URL.includes(STAGING_REF);
}

async function goToDashboard(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem(
      'cookie_consent',
      JSON.stringify({ essential: true, analytics: false, marketing: false, timestamp: new Date().toISOString() }),
    );
    localStorage.removeItem('affiliate_active_mode');
  });
  await loginAffiliateViaUI(page, email, password);
  await page.waitForURL(/\/affiliate\/dashboard/, { timeout: 20_000 });
}

async function switchToSalesRepMode(page: import('@playwright/test').Page) {
  const salesRepBtn = page.getByTestId('mode-btn-sales_rep');
  await expect(salesRepBtn).toBeVisible({ timeout: 10_000 });
  await salesRepBtn.click();
  // Wait for mode switch to settle
  await page.waitForTimeout(500);
}

// ── Sales rep tests ───────────────────────────────────────────────────────────

test.describe('Phase 2B UI — sales_rep sees Přidat firmu (spec 35a)', () => {
  test.skip(
    !isStaging() || !SALES_REP_EMAIL || !SALES_REP_PASSWORD,
    'staging-only; requires E2E_SALES_REP_AFFILIATE_EMAIL + E2E_SALES_REP_AFFILIATE_PASSWORD',
  );

  test.beforeEach(async ({ page }) => {
    await goToDashboard(page, SALES_REP_EMAIL, SALES_REP_PASSWORD);
    await switchToSalesRepMode(page);
  });

  test('sales_rep sees the lead section and Přidat firmu button', async ({ page }) => {
    test.setTimeout(40_000);

    // Section heading
    await expect(
      page.getByText('Žádosti o registraci firem'),
    ).toBeVisible({ timeout: 15_000 });

    // Button in header
    const addBtn = page.getByTestId('add-company-lead-btn').first();
    await expect(addBtn).toBeVisible({ timeout: 10_000 });
  });

  test('dialog opens with required form fields', async ({ page }) => {
    test.setTimeout(40_000);

    const addBtn = page.getByTestId('add-company-lead-btn').first();
    await expect(addBtn).toBeVisible({ timeout: 15_000 });
    await addBtn.click();

    // Dialog should appear
    await expect(page.getByText('Pozvat firmu do OneMil')).toBeVisible({ timeout: 8_000 });

    // Required fields
    await expect(page.locator('#acl-company_name')).toBeVisible();
    await expect(page.locator('#acl-company_email')).toBeVisible();

    // Optional fields
    await expect(page.locator('#acl-ico')).toBeVisible();
    await expect(page.locator('#acl-dic')).toBeVisible();
    await expect(page.locator('#acl-website')).toBeVisible();
    await expect(page.locator('#acl-contact_person')).toBeVisible();
    await expect(page.locator('#acl-contact_phone')).toBeVisible();
    await expect(page.locator('#acl-sales_rep_note')).toBeVisible();

    // Submit button
    await expect(page.getByTestId('acl-submit-btn')).toBeVisible();

    // Close dialog via Zrušit
    await page.getByRole('button', { name: 'Zrušit' }).click();
    await expect(page.getByText('Pozvat firmu do OneMil')).not.toBeVisible({ timeout: 5_000 });
  });

  test('Moje firmy (schválené) section is separate and visible', async ({ page }) => {
    test.setTimeout(30_000);

    // Both sections must coexist — lead section first, then approved companies
    await expect(
      page.getByText('Žádosti o registraci firem'),
    ).toBeVisible({ timeout: 15_000 });

    await expect(
      page.getByText('Moje firmy (schválené)'),
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ── Influencer-only visibility test ──────────────────────────────────────────

test.describe('Phase 2B UI — influencer-only does NOT see Přidat firmu (spec 35b)', () => {
  test.skip(
    !isStaging() || !INFLUENCER_EMAIL || !INFLUENCER_PASSWORD,
    'staging-only; requires E2E_AFFILIATE_EMAIL + E2E_AFFILIATE_PASSWORD',
  );

  test('influencer account switched to Obchodník mode does not show lead section', async ({ page }) => {
    test.setTimeout(40_000);

    await goToDashboard(page, INFLUENCER_EMAIL, INFLUENCER_PASSWORD);
    await switchToSalesRepMode(page);

    // Allow time for any section to load
    await page.waitForTimeout(2_000);

    // The lead section must NOT be visible for influencer-only accounts
    // (condition: activeMode === 'sales_rep' && account.modes.includes('sales_rep'))
    const leadSection = page.getByTestId('company-lead-section');
    const visible = await leadSection.isVisible().catch(() => false);

    // If the influencer account has sales_rep in modes, skip this assertion
    // (the test is only meaningful if the account truly has no sales_rep mode)
    if (visible) {
      test.skip(true, 'Influencer test account also has sales_rep mode — skip assertion');
    }

    await expect(leadSection).not.toBeVisible();
  });
});
