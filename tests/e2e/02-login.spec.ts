import { test, expect } from '@playwright/test';

const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? '';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? '';

test.describe('User Login', () => {
  test('login form renders email, password and submit button', async ({ page }) => {
    await page.goto('/login');

    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Přihlásit se' })).toBeVisible();
  });

  test('invalid credentials stay on login page', async ({ page }) => {
    await page.goto('/login');

    await page.fill('#email', 'nosuchuser@onemil-test.invalid');
    await page.fill('#password', 'wrongpassword');
    await page.getByRole('button', { name: 'Přihlásit se' }).click();

    // Should remain on /login – no redirect on bad credentials
    await expect(page).toHaveURL('/login', { timeout: 10_000 });
  });

  test('valid credentials redirect away from login', async ({ page }) => {
    if (!TEST_EMAIL || !TEST_PASSWORD) {
      test.skip(true, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set – skipping live login test');
    }

    await page.goto('/login');
    await page.fill('#email', TEST_EMAIL);
    await page.fill('#password', TEST_PASSWORD);
    await page.getByRole('button', { name: 'Přihlásit se' }).click();

    // After successful login the app redirects to /profile (customer) or /admin
    await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 20_000 });
    await expect(page).not.toHaveURL('/login');
  });
});
