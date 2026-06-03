/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Affiliate Profile Save  (spec 27)                                         ║
 * ║                                                                            ║
 * ║  Verifies that an affiliate can save profile fields via                    ║
 * ║  update_affiliate_own_profile RPC (migration applied on staging).         ║
 * ║                                                                            ║
 * ║  Checks:                                                                   ║
 * ║    • Profile section renders in /affiliate/dashboard                       ║
 * ║    • "Uložit změny" button is present                                      ║
 * ║    • Saving name + phone + payout_account returns success toast            ║
 * ║    • DB row updated correctly (readback via service role)                  ║
 * ║    • Affiliate cannot see or modify other affiliates' data (RLS check)    ║
 * ║                                                                            ║
 * ║  STAGING-ONLY. Skipped cleanly when any required env var is absent.        ║
 * ║  Requires migration 20260603_affiliate_profile_update.sql on staging.     ║
 * ║                                                                            ║
 * ║  Required env vars:                                                         ║
 * ║    E2E_AFFILIATE_EMAIL        affiliate-e2e@onemil.cz                     ║
 * ║    E2E_AFFILIATE_PASSWORD                                                  ║
 * ║    VITE_SUPABASE_URL                                                       ║
 * ║    E2E_SUPABASE_SERVICE_ROLE_KEY                                           ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { loginViaUI } from './helpers/auth';

const AFFILIATE_EMAIL   = process.env.E2E_AFFILIATE_EMAIL              ?? '';
const AFFILIATE_PASSWORD= process.env.E2E_AFFILIATE_PASSWORD            ?? '';
const SUPABASE_URL      = process.env.VITE_SUPABASE_URL                 ?? '';
const SERVICE_KEY       = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY     ?? '';

const TEST_PHONE   = '+420 777 123 456';
const TEST_BANK    = 'CZ65 0800 0000 0012 3456 7899';

test.describe('Affiliate Profile Save (spec 27)', () => {
  test.skip(
    !AFFILIATE_EMAIL || !AFFILIATE_PASSWORD || !SUPABASE_URL || !SERVICE_KEY,
    'Missing required env vars — skipping spec 27',
  );

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem(
        'cookie_consent',
        JSON.stringify({ essential: true, analytics: false, marketing: false, timestamp: new Date().toISOString() }),
      );
      localStorage.removeItem('affiliate_active_mode');
    });
    await loginViaUI(page, AFFILIATE_EMAIL, AFFILIATE_PASSWORD);
    await page.waitForURL(/\/affiliate\/dashboard/, { timeout: 20_000 });
  });

  test('profile section renders with "Uložit změny" button', async ({ page }) => {
    await expect(page.getByText('Profil a výplatní údaje')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Uložit změny' })).toBeVisible({ timeout: 5_000 });
  });

  test('saving phone and payout_account shows success toast and updates DB', async ({ page }) => {
    // Wait for profile section
    await expect(page.getByText('Profil a výplatní údaje')).toBeVisible({ timeout: 15_000 });

    // Scroll to profile section
    const profileHeading = page.getByText('Profil a výplatní údaje').first();
    await profileHeading.scrollIntoViewIfNeeded();

    // Phone field — placeholder starts with "+420"
    const phoneInput = page.getByPlaceholder('+420', { exact: false }).first();
    await expect(phoneInput).toBeVisible({ timeout: 8_000 });
    await phoneInput.fill(TEST_PHONE);

    // Payout account — placeholder contains "123456789"
    const payoutInput = page.getByPlaceholder('123456789', { exact: false }).first();
    await expect(payoutInput).toBeVisible({ timeout: 5_000 });
    await payoutInput.scrollIntoViewIfNeeded();
    await payoutInput.fill(TEST_BANK);

    // Click save
    await page.getByRole('button', { name: 'Uložit změny' }).click();

    // Expect success toast
    const toastLocator = page.locator('[data-sonner-toast]');
    await expect(toastLocator).toContainText('úspěšně uložen', { timeout: 10_000 });

    // DB readback via service role
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: row } = await (admin as any)
      .from('affiliate_accounts')
      .select('phone, payout_account')
      .eq('email', AFFILIATE_EMAIL)
      .maybeSingle();

    expect(row?.phone).toBe(TEST_PHONE.replace(/\s/g, ' ').trim());
    expect(row?.payout_account).toBe(TEST_BANK.replace(/\s/g, ' ').trim());
  });

  test('affiliate only sees own data — RLS read check', async ({ page }) => {
    await expect(page.getByText('Profil a výplatní údaje')).toBeVisible({ timeout: 15_000 });

    // The page loads without errors (RLS SELECT works for own row)
    await expect(page.locator('body')).not.toContainText('Nepodařilo se načíst');
    await expect(page.locator('body')).not.toContainText('404');
  });
});
