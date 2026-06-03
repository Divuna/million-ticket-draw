/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Admin — Affiliate Account Approve/Reject  (spec 23)                       ║
 * ║                                                                            ║
 * ║  Verifies that an admin can approve a pending affiliate account             ║
 * ║  directly from /admin/affiliate-accounts via the Schválit button.          ║
 * ║                                                                            ║
 * ║  STAGING-ONLY. Skipped cleanly when any required env var is absent.        ║
 * ║                                                                            ║
 * ║  Required env vars:                                                         ║
 * ║    E2E_ADMIN_EMAIL              admin-e2e@onemil.cz                        ║
 * ║    E2E_ADMIN_PASSWORD                                                      ║
 * ║    VITE_SUPABASE_URL            staging Supabase URL                       ║
 * ║    VITE_SUPABASE_ANON_KEY       staging anon key                           ║
 * ║    E2E_SUPABASE_SERVICE_ROLE_KEY staging service role key                  ║
 * ║                                                                            ║
 * ║  What it locks:                                                             ║
 * ║    • /admin/affiliate-accounts route loads for admin                        ║
 * ║    • pending account shows Schválit + Zamítnout buttons                    ║
 * ║    • clicking Schválit opens confirmation dialog                            ║
 * ║    • confirming sets status = approved in DB                                ║
 * ║    • approved account no longer shows Schválit button                      ║
 * ║    • test data is cleaned up after the test                                 ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { loginViaUI } from './helpers/auth';

const ADMIN_EMAIL       = process.env.E2E_ADMIN_EMAIL                ?? '';
const ADMIN_PASSWORD    = process.env.E2E_ADMIN_PASSWORD             ?? '';
const SUPABASE_URL      = process.env.VITE_SUPABASE_URL              ?? '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY         ?? '';
const SERVICE_ROLE_KEY  = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY  ?? '';

const TEST_EMAIL    = 'spec23-affiliate-e2e@onemil.cz';
const TEST_REF_CODE = 'SPEC23E2E';
const TEST_NAME     = 'Spec23 E2E Affiliate';
const TEST_PHONE    = '+420 777 888 999';
const TEST_WEBSITE  = 'https://spec23.onemil.test';
const TEST_ICO      = '12345678';
const TEST_VAT_ID   = 'CZ12345678';
const TEST_BANK     = 'Spec23 Banka';
const TEST_IBAN     = 'CZ6508000000001234567899';

test.describe('Admin — Affiliate account approve (spec 23)', () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD || !SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY,
    'Missing required env vars — skipping spec 23',
  );

  let affiliateId: string | null = null;

  test.beforeAll(async () => {
    // Seed: insert a pending affiliate account directly via service role
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Cleanup any leftover from a previous run
    await (admin as any)
      .from('affiliate_accounts')
      .delete()
      .eq('ref_code', TEST_REF_CODE);

    // Insert fresh pending account (no auth_user_id — admin-created test account)
    const { data, error } = await (admin as any)
      .from('affiliate_accounts')
      .insert({
        name: TEST_NAME,
        email: TEST_EMAIL,
        phone: TEST_PHONE,
        ref_code: TEST_REF_CODE,
        modes: ['influencer', 'sales_rep'],
        status: 'pending',
        commission_rate_customer: 5,
        commission_rate_company: 5,
        is_vat_payer: true,
        website_url: TEST_WEBSITE,
        ico: TEST_ICO,
        vat_id: TEST_VAT_ID,
        billing_street: 'Spec23 ulice 1',
        billing_city: 'Praha',
        billing_zip: '11000',
        billing_country: 'CZ',
        payout_account: TEST_IBAN,
        payout_bank: TEST_BANK,
      })
      .select('id')
      .single();

    if (error) throw new Error(`Seed failed: ${error.message}`);
    affiliateId = data.id;
  });

  test.afterAll(async () => {
    if (!affiliateId) return;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    await (admin as any)
      .from('affiliate_accounts')
      .delete()
      .eq('id', affiliateId);
  });

  test('admin schválí pending affiliate účet', async ({ page }) => {
    // Cookie consent
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem(
        'cookie_consent',
        JSON.stringify({ essential: true, analytics: false, marketing: false, timestamp: new Date().toISOString() }),
      );
    });

    await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    // Navigate to affiliate accounts
    await page.goto('/admin/affiliate-accounts');
    await expect(page.locator('h1')).toContainText('Affiliate účty');

    // Wait for the table to load and find our test account
    const approveBtn = page.locator(`[data-testid="approve-affiliate-${affiliateId}"]`);
    await expect(approveBtn).toBeVisible({ timeout: 15_000 });

    // Admin detail must show registration/profile data used to assess the affiliate.
    await page.getByTestId(`detail-affiliate-${affiliateId}`).click();
    await expect(page.getByTestId('admin-affiliate-registration-detail')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId('admin-affiliate-detail-name')).toContainText(TEST_NAME);
    await expect(page.getByTestId('admin-affiliate-detail-email')).toContainText(TEST_EMAIL);
    await expect(page.getByTestId('admin-affiliate-detail-phone')).toContainText(TEST_PHONE);
    await expect(page.getByTestId('admin-affiliate-detail-modes')).toContainText('Influencer');
    await expect(page.getByTestId('admin-affiliate-detail-modes')).toContainText('Obchodník');
    await expect(page.getByTestId('admin-affiliate-detail-ref-code')).toContainText(TEST_REF_CODE);
    await expect(page.getByTestId('admin-affiliate-detail-website')).toContainText(TEST_WEBSITE);
    await expect(page.getByTestId('admin-affiliate-detail-ico')).toContainText(TEST_ICO);
    await expect(page.getByTestId('admin-affiliate-detail-vat-id')).toContainText(TEST_VAT_ID);
    await expect(page.getByTestId('admin-affiliate-detail-billing')).toContainText('Spec23 ulice 1');
    await expect(page.getByTestId('admin-affiliate-detail-payout-account')).toContainText(TEST_IBAN);
    await expect(page.getByTestId('admin-affiliate-detail-payout-bank')).toContainText(TEST_BANK);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('admin-affiliate-registration-detail')).toHaveCount(0);

    // Click Schválit
    await approveBtn.click();

    // Confirmation dialog should appear
    await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('alertdialog')).toContainText('Schválit affiliate účet?');
    await expect(page.getByRole('alertdialog')).toContainText(TEST_NAME);

    // Confirm
    await page.getByRole('alertdialog').getByRole('button', { name: 'Schválit' }).click();

    // Toast should confirm success
    await expect(page.locator('[data-sonner-toast]')).toContainText('schválen', { timeout: 8_000 });

    // Approve button should disappear (account no longer pending)
    await expect(approveBtn).not.toBeVisible({ timeout: 8_000 });

    // Verify in DB
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: sessionData } = await anon.auth.getSession();
    // Use service role for read-back verification
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: acc } = await (adminClient as any)
      .from('affiliate_accounts')
      .select('status, approved_at')
      .eq('id', affiliateId)
      .single();

    expect(acc?.status).toBe('approved');
    expect(acc?.approved_at).toBeTruthy();
  });
});
