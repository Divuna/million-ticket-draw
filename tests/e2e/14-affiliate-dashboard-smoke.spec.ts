/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Affiliate Dashboard — Login Smoke Test                                    ║
 * ║                                                                            ║
 * ║  READ-ONLY — does NOT mutate data, commissions, referrals, or vouchers.   ║
 * ║  Safe to run against staging (the only environment with a seeded          ║
 * ║  approved Affiliate test account).                                         ║
 * ║                                                                            ║
 * ║  Requires two staging CI secrets:                                          ║
 * ║    STAGING_E2E_AFFILIATE_EMAIL                                             ║
 * ║    STAGING_E2E_AFFILIATE_PASSWORD                                          ║
 * ║                                                                            ║
 * ║  Test is skipped cleanly when either secret is absent (e.g. production    ║
 * ║  smoke, local runs without secrets).                                       ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * What this test verifies:
 *   1. /partner/login renders the partner login form.
 *   2. Logging in as an approved Affiliate partner redirects to /influencer/dashboard.
 *   3. The Affiliate dashboard renders the "Aktivní Affiliate partner" status badge.
 *   4. The H1 "Vydělávejte s OneMil" is visible.
 *   5. The "Váš Affiliate odkaz" section is visible (affiliate link card rendered).
 *   6. The referral link input contains the expected /?ref= pattern.
 *
 * Regressions caught:
 *   - /partner/login stops routing approved influencers to /influencer/dashboard.
 *   - useInfluencerData fails to load (hook returns error state → error screen).
 *   - "Aktivní Affiliate partner" badge removed or renamed.
 *   - Affiliate link section removed from dashboard.
 *   - Auth role check breaks (approved account treated as pending/rejected).
 *   - referralLink format changes from /?ref= pattern.
 */

import { test, expect } from '@playwright/test';

const AFFILIATE_EMAIL    = process.env.E2E_AFFILIATE_EMAIL    ?? '';
const AFFILIATE_PASSWORD = process.env.E2E_AFFILIATE_PASSWORD ?? '';

test.describe('Affiliate Dashboard — Login Smoke', () => {
  test('approved Affiliate partner can log in and sees dashboard with Affiliate link', async ({ page }) => {
    // Allow time for: login round-trip + DB reads (partners, referrals, commissions, campaigns)
    test.setTimeout(60_000);

    // ── Guards ────────────────────────────────────────────────────────────────
    if (!AFFILIATE_EMAIL || !AFFILIATE_PASSWORD) {
      test.skip(
        true,
        'E2E_AFFILIATE_EMAIL / E2E_AFFILIATE_PASSWORD not set — ' +
        'staging-only test; add STAGING_E2E_AFFILIATE_EMAIL and ' +
        'STAGING_E2E_AFFILIATE_PASSWORD secrets to enable.',
      );
    }

    // ── 1. Open login page ────────────────────────────────────────────────────
    // Affiliates share /partner/login with regular partners.
    await page.goto('/partner/login');

    await expect(
      page.getByText('Partnerský portál', { exact: true }),
      '"Partnerský portál" heading must be visible on the login page',
    ).toBeVisible({ timeout: 10_000 });

    // ── 2. Fill credentials ───────────────────────────────────────────────────
    await page.fill('#email', AFFILIATE_EMAIL);
    await page.fill('#password', AFFILIATE_PASSWORD);

    // ── 3. Submit and wait for redirect to /influencer/dashboard ─────────────
    // PartnerLogin detects 'influencer' in partner.notes and redirects accordingly.
    await page.getByRole('button', { name: 'Přihlásit se', exact: true }).click();

    await page.waitForURL(/\/influencer\/dashboard/, { timeout: 20_000 });

    await expect(
      page,
      'Must redirect to /influencer/dashboard after successful Affiliate login',
    ).toHaveURL(/\/influencer\/dashboard/);

    // ── 4. Dashboard must show approved-state content ─────────────────────────
    // If status is not 'approved', the hook returns an error state and shows
    // a different screen ("Žádost ve schvalování", "Žádost zamítnuta", etc.).
    // "Aktivní Affiliate partner" badge is only rendered for approved accounts.
    await expect(
      page.getByText('Aktivní Affiliate partner', { exact: true }),
      '"Aktivní Affiliate partner" badge must be visible — confirms approved status rendered',
    ).toBeVisible({ timeout: 15_000 });

    // ── 5. H1 heading ─────────────────────────────────────────────────────────
    await expect(
      page.getByRole('heading', { name: 'Vydělávejte s OneMil', exact: true }),
      'H1 "Vydělávejte s OneMil" must be visible',
    ).toBeVisible({ timeout: 5_000 });

    // ── 6. Affiliate link section must be visible ─────────────────────────────
    await expect(
      page.getByText('Váš Affiliate odkaz', { exact: true }),
      '"Váš Affiliate odkaz" section heading must be visible',
    ).toBeVisible({ timeout: 5_000 });

    // ── 7. Referral link input must contain /?ref= pattern ───────────────────
    // useInfluencerData builds: `${origin}/?ref=${partnerId}`
    // We verify the input is rendered and contains the expected URL structure
    // without asserting the exact partner ID (which is environment-specific).
    const referralInput = page.locator('input[readonly]').first();
    await expect(
      referralInput,
      'Referral link input (readonly) must be visible',
    ).toBeVisible({ timeout: 5_000 });

    const referralValue = (await referralInput.inputValue()) ?? '';
    expect(
      referralValue,
      `Referral link must contain "/?ref=" pattern. Got: "${referralValue}"`,
    ).toMatch(/\/\?ref=/);
  });
});
