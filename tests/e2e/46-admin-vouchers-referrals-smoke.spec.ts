/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Admin — Vouchers & Doporučení a odměny Pages Smoke Test                    ║
 * ║                                                                            ║
 * ║  READ-ONLY — no voucher create/edit, no invite-reward create/modify, no    ║
 * ║  form submissions, no emails, no SQL. Safe on staging (never production).   ║
 * ║                                                                            ║
 * ║  Requires two staging CI secrets:                                          ║
 * ║    STAGING_E2E_ADMIN_EMAIL    (→ E2E_ADMIN_EMAIL)                          ║
 * ║    STAGING_E2E_ADMIN_PASSWORD (→ E2E_ADMIN_PASSWORD)                       ║
 * ║                                                                            ║
 * ║  Test is skipped cleanly when either secret is absent (e.g. production     ║
 * ║  smoke, local runs without secrets).                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * What this test verifies:
 *   1. Admin can log in via /login and access admin routes without error.
 *   2. /admin/vouchers renders the "Přehled voucherů" heading (page loads,
 *      no error boundary / blank screen, no uncaught page error).
 *   3. /admin/referrals renders the admin "Doporučení a odměny" overview
 *      (tabs "Doporučení hráčů" + "Audit doporučení") without error.
 *
 * Regressions caught:
 *   - Admin auth guard blocking /admin/vouchers or /admin/referrals for valid
 *     admin accounts.
 *   - Page-level rendering crash (unhandled error boundary, blank screen).
 *   - Heading / tab copy changed without review.
 *   - Routes accidentally removed or redirecting to AdminNotFound.
 *
 * Closes the audit gap: these two admin P0 pages previously had no dedicated
 * smoke spec (verified only via route + RLS policy checks).
 */

import { test, expect } from '@playwright/test';
import { loginViaUI } from './helpers/auth';

const ADMIN_EMAIL    = (process.env.E2E_SUPERADMIN_EMAIL || process.env.E2E_ADMIN_EMAIL)    ?? '';
const ADMIN_PASSWORD = (process.env.E2E_SUPERADMIN_PASSWORD || process.env.E2E_ADMIN_PASSWORD) ?? '';

test.describe('Admin — Vouchers & Doporučení a odměny Pages Smoke', () => {
  test('admin can open /admin/vouchers and /admin/referrals without error', async ({ page }) => {
    // Allow time for: admin login round-trip + two page navigations with DB reads.
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

    // Fail fast on an uncaught client-side error on either page.
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    // ── 1. Login as admin ─────────────────────────────────────────────────────
    // Admin accounts share /login with regular users.
    // useUserRole() detects the admin role and grants access to /admin/*.
    await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    // ── 2. /admin/vouchers — "Přehled voucherů" ──────────────────────────────
    await page.goto('/admin/vouchers');

    await expect(
      page.getByRole('heading', { name: 'Přehled voucherů', exact: true }),
      'H1 "Přehled voucherů" must be visible on /admin/vouchers',
    ).toBeVisible({ timeout: 15_000 });

    // ── 3. /admin/referrals — admin "Doporučení a odměny" overview ───────────
    // The overview renders two tabs; assert both (each is a unique tab role,
    // avoiding strict-mode collisions with the matching card title).
    await page.goto('/admin/referrals');

    await expect(
      page.getByRole('tab', { name: 'Doporučení hráčů' }),
      'Tab "Doporučení hráčů" must be visible on /admin/referrals',
    ).toBeVisible({ timeout: 15_000 });

    await expect(
      page.getByRole('tab', { name: 'Audit doporučení' }),
      'Tab "Audit doporučení" must be visible on /admin/referrals',
    ).toBeVisible({ timeout: 15_000 });

    // ── 4. No uncaught client-side errors on either page ─────────────────────
    expect(pageErrors, `Unexpected page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});
