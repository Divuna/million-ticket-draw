import { test, expect } from '@playwright/test';

/**
 * Affiliate v2 — Influencer ref_code must survive homepage -> "Registrovat".
 *
 * Fixes the confirmed break: Header.tsx's "Registrovat" link used to drop
 * the whole query string, so a visitor arriving via /i/:refCode ->
 * /?ref=<code> lost the code the moment they clicked "Registrovat".
 *
 * Pure frontend routing/storage tests — no login, no staging secrets,
 * safe to run anywhere (including production smoke scope later if desired).
 */

test.describe('Affiliate influencer ref_code preserved into registration (spec 139)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'cookie_consent',
        JSON.stringify({ essential: true, analytics: false, marketing: false, timestamp: new Date().toISOString() }),
      );
    });
  });

  test('clicking "Registrovat" from /?ref=<code> preserves the ref query param to /register', async ({ page }) => {
    await page.goto('/?ref=PAVELDIVI1EF7');

    await page.getByRole('button', { name: 'Registrovat' }).click();

    await expect(page).toHaveURL(/\/register\?ref=PAVELDIVI1EF7$/, { timeout: 10_000 });
  });

  test('"Registrovat" link target has no ref param when the homepage has none', async ({ page }) => {
    await page.goto('/');

    const registerLink = page.getByRole('link', { name: 'Registrovat' });
    await expect(registerLink).toBeVisible({ timeout: 10_000 });
    await expect(registerLink).toHaveAttribute('href', '/register');
  });

  test('/register?ref=<code> stores the pending affiliate ref_code in sessionStorage', async ({ page }) => {
    await page.goto('/register?ref=PAVELDIVI1EF7');

    await expect
      .poll(async () => page.evaluate(() => sessionStorage.getItem('onemil_affiliate_ref')), { timeout: 10_000 })
      .toBe('PAVELDIVI1EF7');
  });

  test('full short-link chain: /i/<code> -> homepage -> Registrovat -> /register?ref=<code>', async ({ page }) => {
    await page.goto('/i/PAVELDIVI1EF7');
    await expect(page).toHaveURL(/\/\?ref=PAVELDIVI1EF7$/, { timeout: 10_000 });

    await page.getByRole('button', { name: 'Registrovat' }).click();

    await expect(page).toHaveURL(/\/register\?ref=PAVELDIVI1EF7$/, { timeout: 10_000 });
    await expect
      .poll(async () => page.evaluate(() => sessionStorage.getItem('onemil_affiliate_ref')), { timeout: 10_000 })
      .toBe('PAVELDIVI1EF7');
  });
});
