/**
 * STAGING ONLY - Profile page smoke
 *
 * This test is read-only. It logs in as the staging E2E user and verifies that
 * /profile renders the user's identity, wallet/MioCoin area, and basic account
 * sections. It must not run in production.
 */

import { test, expect } from '@playwright/test';
import { loginViaUI } from './helpers/auth';

const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? '';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? '';
// Provided only by STAGING_E2E_CONTEST_ID secret; absent on production CI.
const TEST_CONTEST_ID = process.env.E2E_CONTEST_ID ?? '';

test.describe('Profile Smoke', () => {
  test('renders profile identity, wallet, and account sections for E2E user', async ({ page }) => {
    test.setTimeout(45_000);

    if (!TEST_EMAIL || !TEST_PASSWORD) {
      test.skip(true, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set - skipping');
    }
    if (!TEST_CONTEST_ID) {
      test.skip(
        true,
        'E2E_CONTEST_ID not set - staging-only test; production CI intentionally leaves this empty',
      );
    }

    await loginViaUI(page, TEST_EMAIL, TEST_PASSWORD);

    await page.goto('/profile');
    await page.waitForURL((url) => url.pathname === '/profile', { timeout: 20_000 });

    expect(page.url(), 'Profile smoke must not redirect back to login').not.toContain('/login');
    expect(page.url(), 'Profile smoke must not redirect to onboarding').not.toContain('/onboarding');

    await expect(page.getByText(TEST_EMAIL, { exact: true })).toBeVisible({ timeout: 15_000 });

    await expect(
      page.getByText(/Můj profil|Profil a kontaktní informace|Profil/i).first(),
      'Profile identity text should render',
    ).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText('Peněženka', { exact: true })).toBeVisible();
    await expect(page.getByText('MioCoiny', { exact: true })).toBeVisible();
    await expect(page.getByText(/Váš MioCoin účet/i)).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Účet' })).toBeVisible();
    await expect(page.getByText(/Přihlašovací údaje/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Osobní údaje' })).toBeVisible();
  });

  test('test notification button shows handled success or error toast (no unhandled crash)', async ({ page }) => {
    test.setTimeout(45_000);

    if (!TEST_EMAIL || !TEST_PASSWORD) {
      test.skip(true, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set - skipping');
    }
    if (!TEST_CONTEST_ID) {
      test.skip(
        true,
        'E2E_CONTEST_ID not set - staging-only test; production CI intentionally leaves this empty',
      );
    }

    await loginViaUI(page, TEST_EMAIL, TEST_PASSWORD);

    await page.goto('/profile');
    await page.waitForURL((url) => url.pathname === '/profile', { timeout: 20_000 });

    // Capture the Edge Function HTTP response so we can assert the function
    // never crashes with an unexpected 5xx. A 400 (no push recipient) is a
    // valid handled outcome and must NOT fail the test.
    const responsePromise = page
      .waitForResponse(
        (res) => res.url().includes('/functions/v1/send-test-notification'),
        { timeout: 20_000 },
      )
      .catch(() => null);

    const testButton = page.getByRole('button', { name: /Otestovat notifikaci/i });
    await expect(testButton).toBeVisible({ timeout: 15_000 });
    await testButton.scrollIntoViewIfNeeded();
    await testButton.click();

    // Expected handled outcomes:
    //  - success toast "Notifikace odeslána"
    //  - handled error toast "Chyba při odeslání" (e.g. user has no push recipient)
    const successToast = page.getByText(/Notifikace odeslána/i);
    const errorToast = page.getByText(/Chyba při odeslání/i);

    await expect(
      successToast.or(errorToast).first(),
      'Test notification must surface a handled success or error toast',
    ).toBeVisible({ timeout: 20_000 });

    // Guard: the Edge Function must not crash with a 5xx. 2xx = sent,
    // 400 = handled "no recipient", both acceptable.
    const res = await responsePromise;
    if (res) {
      expect(
        res.status(),
        `Edge Function returned unexpected status ${res.status()}`,
      ).toBeLessThan(500);
    }
  });
});
