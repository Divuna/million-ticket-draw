/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Admin — Affiliate Pages Smoke Test                                        ║
 * ║                                                                            ║
 * ║  READ-ONLY — no approvals, no rejections, no mutations, no form           ║
 * ║  submissions. Safe to run against staging (never production).              ║
 * ║                                                                            ║
 * ║  Requires two staging CI secrets:                                          ║
 * ║    STAGING_E2E_ADMIN_EMAIL                                                 ║
 * ║    STAGING_E2E_ADMIN_PASSWORD                                              ║
 * ║                                                                            ║
 * ║  Test is skipped cleanly when either secret is absent (e.g. production    ║
 * ║  smoke, local runs without secrets).                                       ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * What this test verifies:
 *   1. Admin can log in via /login and access admin routes without error.
 *   2. /admin/influencers renders the "Affiliate partneři" heading.
 *   3. /admin/influencer-commissions renders the "Výplaty Affiliate partnerů" heading.
 *   4. /admin/influencer-campaigns renders the "Affiliate kampaně" heading.
 *
 * Regressions caught:
 *   - Admin auth guard blocking /admin/influencers, /admin/influencer-commissions,
 *     or /admin/influencer-campaigns for valid admin accounts.
 *   - Page-level rendering crash (unhandled error boundary, blank screen).
 *   - H1 / heading text changed without copy review.
 *   - Routes accidentally removed or redirecting to AdminNotFound.
 */

import { test, expect } from '@playwright/test';
import { loginViaUI } from './helpers/auth';

const ADMIN_EMAIL    = (process.env.E2E_SUPERADMIN_EMAIL || process.env.E2E_ADMIN_EMAIL)    ?? '';
const ADMIN_PASSWORD = (process.env.E2E_SUPERADMIN_PASSWORD || process.env.E2E_ADMIN_PASSWORD) ?? '';

test.describe('Admin — Affiliate Pages Smoke', () => {
  test('admin can open all three Affiliate admin pages without error', async ({ page }) => {
    // Allow time for: admin login round-trip + three page navigations with DB reads.
    test.setTimeout(60_000);

    // ── Guards ────────────────────────────────────────────────────────────────
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      test.skip(
        true,
        'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set — ' +
        'staging-only test; add STAGING_E2E_ADMIN_EMAIL and ' +
        'STAGING_E2E_ADMIN_PASSWORD secrets to enable.',
      );
    }

    // ── 1. Login as admin ─────────────────────────────────────────────────────
    // Admin accounts share /login with regular users.
    // useUserRole() detects the admin role and grants access to /admin/*.
    await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    // ── 2. /admin/influencers — "Affiliate partneři" ─────────────────────────
    await page.goto('/admin/influencers');

    await expect(
      page.getByRole('heading', { name: 'Affiliate partneři', exact: true }),
      'H1 "Affiliate partneři" must be visible on /admin/influencers',
    ).toBeVisible({ timeout: 15_000 });

    // ── 3. /admin/influencer-commissions — "Výplaty Affiliate partnerů" ──────
    await page.goto('/admin/influencer-commissions');

    await expect(
      page.getByRole('heading', { name: 'Výplaty Affiliate partnerů', exact: true }),
      'H1 "Výplaty Affiliate partnerů" must be visible on /admin/influencer-commissions',
    ).toBeVisible({ timeout: 15_000 });

    // ── 4. /admin/influencer-campaigns — "Affiliate kampaně" ─────────────────
    await page.goto('/admin/influencer-campaigns');

    await expect(
      page.getByRole('heading', { name: 'Affiliate kampaně', exact: true }),
      'H1 "Affiliate kampaně" must be visible on /admin/influencer-campaigns',
    ).toBeVisible({ timeout: 15_000 });
  });
});
