/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Legacy Influencer → Affiliate v2 UI routing  (spec 25)                   ║
 * ║                                                                            ║
 * ║  Verifies that a legacy influencer account (partner row with influencer    ║
 * ║  in notes) is routed to the NEW /affiliate/dashboard, NOT the old          ║
 * ║  /influencer/dashboard.                                                    ║
 * ║                                                                            ║
 * ║  Also verifies that direct navigation to /influencer/dashboard redirects  ║
 * ║  to /affiliate/dashboard (route-level redirect).                           ║
 * ║                                                                            ║
 * ║  STAGING-ONLY. Skipped cleanly when any required env var is absent.        ║
 * ║                                                                            ║
 * ║  Required env vars:                                                         ║
 * ║    E2E_AFFILIATE_EMAIL        affiliate-e2e@onemil.cz (legacy influencer) ║
 * ║    E2E_AFFILIATE_PASSWORD                                                  ║
 * ║    VITE_SUPABASE_URL          staging Supabase URL                        ║
 * ║                                                                            ║
 * ║  What it locks:                                                             ║
 * ║    • Legacy influencer login lands on /affiliate/dashboard                 ║
 * ║    • /influencer/dashboard redirects to /affiliate/dashboard               ║
 * ║    • AffiliateDashboard component renders (h1 or key element visible)     ║
 * ║    • Old /influencer/dashboard is no longer the primary production path   ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { test, expect } from '@playwright/test';
import { loginViaUI } from './helpers/auth';

const AFFILIATE_EMAIL    = process.env.E2E_AFFILIATE_EMAIL    ?? '';
const AFFILIATE_PASSWORD = process.env.E2E_AFFILIATE_PASSWORD ?? '';
const SUPABASE_URL       = process.env.VITE_SUPABASE_URL      ?? '';

test.describe('Legacy influencer → Affiliate v2 UI routing (spec 25)', () => {
  test.skip(
    !AFFILIATE_EMAIL || !AFFILIATE_PASSWORD || !SUPABASE_URL,
    'Missing required env vars — skipping spec 25',
  );

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem(
        'cookie_consent',
        JSON.stringify({ essential: true, analytics: false, marketing: false, timestamp: new Date().toISOString() }),
      );
    });
  });

  test('legacy influencer login lands on /affiliate/dashboard', async ({ page }) => {
    await loginViaUI(page, AFFILIATE_EMAIL, AFFILIATE_PASSWORD);

    // Should be redirected to /affiliate/dashboard — NOT /influencer/dashboard
    await expect(page).toHaveURL(/\/affiliate\/dashboard/, { timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/influencer\/dashboard/);

    // AffiliateDashboard should render — check for a key heading or element
    // The page shows "Váš Affiliate odkaz" or similar heading
    await expect(page.locator('body')).not.toContainText('404');
    await expect(page.locator('body')).not.toContainText('Page not found');

    // The dashboard should load without a crash or blank screen
    const mainContent = page.locator('main, [role="main"], .container, h1, h2').first();
    await expect(mainContent).toBeVisible({ timeout: 10_000 });
  });

  test('/influencer/dashboard redirects to /affiliate/dashboard', async ({ page }) => {
    await loginViaUI(page, AFFILIATE_EMAIL, AFFILIATE_PASSWORD);

    // Force navigation to old URL
    await page.goto('/influencer/dashboard');

    // Should be redirected to /affiliate/dashboard
    await expect(page).toHaveURL(/\/affiliate\/dashboard/, { timeout: 10_000 });
  });
});
