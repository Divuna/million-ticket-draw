/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Affiliate Dashboard — Login Smoke Test                                    ║
 * ║                                                                            ║
 * ║  READ-ONLY. Safe to run against staging (seeded approved Affiliate test    ║
 * ║  account that is a legacy influencer: present in BOTH partners (notes.type ║
 * ║  = influencer) AND affiliate_accounts).                                    ║
 * ║                                                                            ║
 * ║  Verifies the entrance separation:                                          ║
 * ║   1. Influencer/affiliate CANNOT enter via /partner/login (company-partner ║
 * ║      portal) — blocked with the partner message, stays on /partner/login.  ║
 * ║   2. Affiliate logs in via the dedicated /affiliate/login → /affiliate/    ║
 * ║      dashboard renders.                                                     ║
 * ║                                                                            ║
 * ║  Skipped cleanly when the affiliate secrets are absent.                     ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { test, expect } from '@playwright/test';
import { loginAffiliateViaUI } from './helpers/auth';

const AFFILIATE_EMAIL    = process.env.E2E_AFFILIATE_EMAIL    ?? '';
const AFFILIATE_PASSWORD = process.env.E2E_AFFILIATE_PASSWORD ?? '';

test.describe('Affiliate Dashboard — Login Smoke', () => {
  test.skip(
    !AFFILIATE_EMAIL || !AFFILIATE_PASSWORD,
    'E2E_AFFILIATE_EMAIL / E2E_AFFILIATE_PASSWORD not set — staging-only test.',
  );

  test('influencer/affiliate is blocked on /partner/login (company portal)', async ({ page }) => {
    await page.goto('/partner/login');
    await expect(page.getByText('Partnerský portál', { exact: true })).toBeVisible({ timeout: 10_000 });
    await page.fill('#email', AFFILIATE_EMAIL);
    await page.fill('#password', AFFILIATE_PASSWORD);
    await page.getByRole('button', { name: 'Přihlásit se', exact: true }).click();

    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'nemáte firemní Partner účet' }).first())
      .toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/partner\/login/);
  });

  test('affiliate logs in via /affiliate/login and sees the dashboard', async ({ page }) => {
    test.setTimeout(60_000);
    await loginAffiliateViaUI(page, AFFILIATE_EMAIL, AFFILIATE_PASSWORD);
    await expect(page).toHaveURL(/\/affiliate\/dashboard/);

    const body = page.locator('body');
    await expect(
      body.getByText('Vydělávejte s OneMil')
        .or(body.getByText('Affiliate program'))
        .or(body.getByText('Affiliate dashboard'))
        .first(),
    ).toBeVisible({ timeout: 20_000 });
    await expect(body).not.toContainText('404');
    await expect(body).not.toContainText('Page not found');
  });
});
