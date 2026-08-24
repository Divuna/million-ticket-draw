import { test, expect } from '@playwright/test';

/**
 * Customer/player referral short link alias — /r/:refCode
 *
 * Verifies the short public link redirects to the existing, unchanged flow:
 *   /r/:refCode -> /register?ref=:refCode
 *
 * Mirrors 58-affiliate-short-link-redirect.spec.ts (/a/:refCode, /i/:refCode)
 * for the ReferralSection.tsx (player referral) short link added alongside
 * them. Pure frontend routing test — no Supabase writes, no attribution, no
 * login required. Register.tsx's existing ?ref= capture (PENDING_REFERRAL /
 * PENDING_AFFILIATE_REF sessionStorage keys, set_my_referrer_by_code,
 * record_affiliate_customer_ref) is exercised elsewhere (specs 139/140) and
 * is untouched by this change.
 */

test.describe('Customer referral short link — /r/:refCode redirect (spec 146)', () => {
  test('redirects to /register?ref=<code> and renders the registration form', async ({ page }) => {
    await page.goto('/r/PAVELDIVISEA7');

    await expect(page).toHaveURL(/\/register\?ref=PAVELDIVISEA7$/, { timeout: 10_000 });
    await expect(page.locator('#email')).toBeVisible({ timeout: 10_000 });
  });

  test('preserves the exact ref_code casing and value through the redirect', async ({ page }) => {
    await page.goto('/r/AbC123xyz');

    await expect(page).toHaveURL(/\/register\?ref=AbC123xyz$/, { timeout: 10_000 });
  });

  test('missing code falls back to plain /register without a ref param', async ({ page }) => {
    await page.goto('/r/%20');

    await expect(page).toHaveURL(/\/register$/, { timeout: 10_000 });
    await expect(page.locator('#email')).toBeVisible({ timeout: 10_000 });
  });

  test('old long-form /register?ref=<code> link still works unchanged', async ({ page }) => {
    await page.goto('/register?ref=PAVELDIVISEA7');

    await expect(page).toHaveURL(/\/register\?ref=PAVELDIVISEA7$/, { timeout: 10_000 });
    await expect(page.locator('#email')).toBeVisible({ timeout: 10_000 });
  });
});
