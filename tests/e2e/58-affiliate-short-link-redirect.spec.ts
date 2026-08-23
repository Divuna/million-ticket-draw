import { test, expect } from '@playwright/test';

/**
 * Affiliate short link alias — /a/:refCode
 *
 * Verifies that the short public company link redirects to the existing,
 * unchanged /partner/register?via=:refCode flow. Pure frontend routing test —
 * no Supabase writes, no affiliate attribution, no login required.
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
