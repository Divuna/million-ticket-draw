import { test, expect } from '@playwright/test';

/**
 * Affiliate short link aliases — /a/:refCode and /i/:refCode
 *
 * Verifies that the short public links redirect to the existing, unchanged
 * flows:
 *   /a/:refCode -> /partner/register?via=:refCode  (Obchodník / company)
 *   /i/:refCode -> /?ref=:refCode                  (Influencer / customer)
 *
 * Pure frontend routing tests — no Supabase writes, no affiliate
 * attribution, no login required.
 */

test.describe('Affiliate short link — /a/:refCode redirect (spec 58)', () => {
  test('redirects to /partner/register?via=<code> and renders the registration form', async ({ page }) => {
    await page.goto('/a/PAVELDIVISEA7');

    await expect(page).toHaveURL(/\/partner\/register\?via=PAVELDIVISEA7$/, { timeout: 10_000 });
    await expect(page.locator('#companyName')).toBeVisible({ timeout: 10_000 });
  });

  test('preserves the exact ref_code casing and value through the redirect', async ({ page }) => {
    await page.goto('/a/AbC123xyz');

    await expect(page).toHaveURL(/\/partner\/register\?via=AbC123xyz$/, { timeout: 10_000 });
  });

  test('missing code falls back to plain /partner/register without a via param', async ({ page }) => {
    await page.goto('/a/%20');

    await expect(page).toHaveURL(/\/partner\/register/, { timeout: 10_000 });
    await expect(page.locator('#companyName')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Affiliate short link — /i/:refCode redirect (spec 58)', () => {
  test('redirects to /?ref=<code>', async ({ page }) => {
    await page.goto('/i/PAVELDIVI1EF7');

    await expect(page).toHaveURL(/\/\?ref=PAVELDIVI1EF7$/, { timeout: 10_000 });
  });

  test('preserves the exact ref_code casing and value through the redirect', async ({ page }) => {
    await page.goto('/i/AbC123xyz');

    await expect(page).toHaveURL(/\/\?ref=AbC123xyz$/, { timeout: 10_000 });
  });

  test('missing code falls back to plain / without a ref param', async ({ page }) => {
    await page.goto('/i/%20');

    await expect(page).toHaveURL(/^https?:\/\/[^/]+\/$/, { timeout: 10_000 });
  });
});
