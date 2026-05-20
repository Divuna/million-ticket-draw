/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Admin — Online Teď (Registered Users)                                     ║
 * ║                                                                            ║
 * ║  Locks the registered-user heartbeat presence flow introduced in           ║
 * ║  commit 0732738 (PR #84) and the runtime crash fix commit ab5cb25.        ║
 * ║                                                                            ║
 * ║  STAGING-ONLY. Skipped cleanly when any required env var is absent.        ║
 * ║                                                                            ║
 * ║  Required env vars (all already present in playwright-staging.yml):        ║
 * ║    E2E_TEST_EMAIL       — normal E2E user   (e2e@onemil.cz)               ║
 * ║    E2E_TEST_PASSWORD    — normal E2E user password                         ║
 * ║    E2E_ADMIN_EMAIL      — admin  E2E user   (admin-e2e@onemil.cz)         ║
 * ║    E2E_ADMIN_PASSWORD   — admin  E2E user password                         ║
 * ║                                                                            ║
 * ║  No seed step required — the existing E2E accounts and the already-applied ║
 * ║  20260520_registered_user_presence migration are sufficient.               ║
 * ║                                                                            ║
 * ║  What it locks:                                                            ║
 * ║    • useHeartbeat fires bump_user_last_seen immediately after sign-in      ║
 * ║    • get_admin_online_users returns the active user to the admin           ║
 * ║    • "Online teď" badge count is ≥ 1 while a signed-in user is active     ║
 * ║    • Popover lists the normal E2E user's email                             ║
 * ║    • No "Anonymní návštěvníci" section (anonymous tracking not in OneMil) ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { test, expect } from '@playwright/test';
import { loginViaUI } from './helpers/auth';

const E2E_TEST_EMAIL    = process.env.E2E_TEST_EMAIL     ?? '';
const E2E_TEST_PASSWORD = process.env.E2E_TEST_PASSWORD  ?? '';
const ADMIN_EMAIL       = process.env.E2E_ADMIN_EMAIL    ?? '';
const ADMIN_PASSWORD    = process.env.E2E_ADMIN_PASSWORD ?? '';

// Cookie consent pre-seed — prevents the banner from blocking pointer events.
// Applied via addInitScript so it is in localStorage before the first render.
const seedCookieConsent = () => {
  localStorage.setItem(
    'cookie_consent',
    JSON.stringify({
      essential: true,
      analytics: false,
      marketing: false,
      timestamp: new Date().toISOString(),
    }),
  );
};

test.describe('Admin — Online Teď (registered users)', () => {
  test(
    'normal E2E user appears in admin Online Teď after heartbeat fires',
    async ({ browser }) => {
      test.setTimeout(120_000);

      // Skip cleanly on production CI (secrets not set) or local runs without staging creds.
      if (!E2E_TEST_EMAIL || !E2E_TEST_PASSWORD || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
        test.skip(
          true,
          'E2E_TEST_EMAIL / E2E_TEST_PASSWORD / E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD ' +
          'not set — staging-only test',
        );
      }

      // ── Context 1: Normal E2E user ─────────────────────────────────────────
      // Signs in so that useHeartbeat(user?.id) mounts in AppContent and fires
      // bump_user_last_seen() immediately, writing last_seen_at on staging.
      const userCtx  = await browser.newContext();
      const userPage = await userCtx.newPage();
      await userPage.addInitScript(seedCookieConsent);

      await loginViaUI(userPage, E2E_TEST_EMAIL, E2E_TEST_PASSWORD);
      // loginViaUI already waits for navigation away from /login.
      // useHeartbeat fires on mount right after the app renders.
      // 6 s is a conservative buffer for staging RPC round-trip to complete.
      await userPage.waitForTimeout(6_000);

      // ── Context 2: Admin user ──────────────────────────────────────────────
      // Signs in and opens the admin dashboard to inspect the Online Teď badge.
      const adminCtx  = await browser.newContext();
      const adminPage = await adminCtx.newPage();
      await adminPage.addInitScript(seedCookieConsent);

      await loginViaUI(adminPage, ADMIN_EMAIL, ADMIN_PASSWORD);
      await adminPage.goto('/admin');

      // ── Step A: Online Teď badge is visible and shows count ≥ 1 ────────────
      // The button lives inside the "hidden md:flex" admin top bar — visible at
      // Desktop Chrome's 1280 px viewport (≥ Tailwind md breakpoint).
      // useAdminOnlineIndicator fires get_admin_online_users on mount; the RPC
      // returns users whose last_seen_at is within the last 300 s.
      const onlineBtn = adminPage.getByTitle(
        'Online uživatelé (živě) - klikni pro detaily',
      );
      await expect(onlineBtn).toBeVisible({ timeout: 20_000 });

      // The count span: <span class="font-medium text-foreground">{onlineCount}</span>
      // Wait until it holds a positive integer — not "0" and not the initial empty state.
      const countSpan = onlineBtn.locator('span.font-medium');
      await expect(countSpan).toHaveText(/^[1-9][0-9]*$/, { timeout: 25_000 });

      // ── Step B: Popover lists the normal E2E user's email ──────────────────
      await onlineBtn.click();

      // Wait for the popover header rendered by AdminSoundIndicator.
      const popoverHeader = adminPage.locator('h4', {
        hasText: /Online uživatelé/i,
      });
      await expect(popoverHeader).toBeVisible({ timeout: 8_000 });

      // AdminSoundIndicator fetches display details (email, name) from
      // public.users when onlineUsers changes. The normal E2E user's email
      // must appear in the popover list.
      await expect(
        adminPage.getByText(E2E_TEST_EMAIL, { exact: false }),
      ).toBeVisible({ timeout: 12_000 });

      // ── Step C: No anonymous section ──────────────────────────────────────
      // Anonymous visitor tracking is not in OneMil (Google Analytics only).
      // The popover must not contain an "Anonymní návštěvníci" heading.
      await expect(
        adminPage.getByText(/Anonymní návštěvníci/i),
      ).not.toBeVisible();

      // ── Teardown ──────────────────────────────────────────────────────────
      await userCtx.close();
      await adminCtx.close();
    },
  );
});
