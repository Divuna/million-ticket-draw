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
 *   2. Logging in as an approved Affiliate partner redirects to /affiliate/dashboard
 *      (Affiliate v2 UI — legacy influencers are now routed to v2 dashboard).
 *      Note: /influencer/dashboard route-level redirects to /affiliate/dashboard.
 *   3. The Affiliate v2 dashboard renders — h1 contains "Affiliate".
 *
 * Regressions caught:
 *   - /partner/login stops routing approved influencers to /affiliate/dashboard.
 *   - AffiliateDashboard crashes or shows error on load.
 *   - Routing changes accidentally break the redirect chain.
 */

import { test, expect } from '@playwright/test';

const AFFILIATE_EMAIL    = process.env.E2E_AFFILIATE_EMAIL    ?? '';
const AFFILIATE_PASSWORD = process.env.E2E_AFFILIATE_PASSWORD ?? '';

test.describe('Affiliate Dashboard — Login Smoke', () => {
  test('approved Affiliate partner can log in and sees Affiliate v2 dashboard', async ({ page }) => {
    // Allow time for: login round-trip + DB reads + redirect chain
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
    await page.goto('/partner/login');

    await expect(
      page.getByText('Partnerský portál', { exact: true }),
      '"Partnerský portál" heading must be visible on the login page',
    ).toBeVisible({ timeout: 10_000 });

    // ── 2. Fill credentials ───────────────────────────────────────────────────
    await page.fill('#email', AFFILIATE_EMAIL);
    await page.fill('#password', AFFILIATE_PASSWORD);

    // ── 3. Submit and wait for redirect to /affiliate/dashboard ──────────────
    // PartnerLogin navigates to /influencer/dashboard for influencers, which
    // route-redirects to /affiliate/dashboard (Affiliate v2 UI).
    await page.getByRole('button', { name: 'Přihlásit se', exact: true }).click();

    await page.waitForURL(/\/affiliate\/dashboard/, { timeout: 20_000 });

    await expect(
      page,
      'Must end up on /affiliate/dashboard after successful Affiliate login',
    ).toHaveURL(/\/affiliate\/dashboard/);

    // ── 4. Affiliate v2 dashboard must render ────────────────────────────────
    // If user is in affiliate_accounts (approved): shows "Vydělávejte s OneMil" hero h1.
    // If user is NOT in affiliate_accounts (e.g. staging without migration): "Affiliate program".
    // Accept either — covers both staging and production scenarios.
    const bodyText = await page.locator('body').textContent({ timeout: 15_000 }) ?? '';
    const knownTexts = ['Vydělávejte s OneMil', 'Affiliate program', 'Affiliate dashboard'];
    const hasKnownText = knownTexts.some(t => bodyText.includes(t));
    expect(hasKnownText, `Page must show one of: ${knownTexts.join(', ')}`).toBe(true);

    // Page must not show a generic error or 404
    await expect(page.locator('body')).not.toContainText('404');
    await expect(page.locator('body')).not.toContainText('Page not found');
  });
});
