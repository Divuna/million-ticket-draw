import { test, expect } from '@playwright/test';

function fakeSession() {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: 'fake-customer-reset-access-token',
    refresh_token: 'fake-customer-reset-refresh-token',
    expires_in: 3600,
    expires_at: now + 3600,
    token_type: 'bearer',
    user: {
      id: '11111111-2222-4333-8444-555555555555',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'reset-smoke@onemil.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
}

test.describe('44 - customer password reset', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('cookie_consent', JSON.stringify({
        essential: true,
        analytics: false,
        marketing: false,
        timestamp: new Date().toISOString(),
      }));
    });
  });

  test('44a) login exposes forgotten-password route', async ({ page }) => {
    await page.goto('/login');

    const link = page.getByRole('link', { name: 'Zapomenuté heslo?' });
    await expect(link).toBeVisible();
    await link.click();

    await expect(page).toHaveURL(/\/reset-password$/);
    await expect(page.getByRole('heading', { name: 'Obnovení hesla' })).toBeVisible();
  });

  test('44b) reset request calls Supabase recovery with /reset-password redirect', async ({ page }) => {
    let requestBody = '';
    let requestUrl = '';

    await page.route('**/auth/v1/recover*', async (route) => {
      requestBody = route.request().postData() ?? '';
      requestUrl = route.request().url();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{}',
      });
    });

    await page.goto('/reset-password');
    await page.getByTestId('reset-email').fill('reset-smoke@onemil.test');
    await page.getByTestId('reset-request-submit').click();

    await expect(page.getByText('Zkontrolujte e-mail')).toBeVisible({ timeout: 10_000 });
    expect(requestBody).toContain('reset-smoke@onemil.test');
    expect(decodeURIComponent(requestUrl)).toContain('/reset-password');
  });

  test('44c) active recovery session can submit a new customer password', async ({ page }) => {
    const session = fakeSession();
    let updateBody = '';

    await page.route('**/auth/v1/user*', async (route) => {
      if (route.request().method() === 'PUT') {
        updateBody = route.request().postData() ?? '';
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(session.user),
        });
        return;
      }

      await route.fallback();
    });

    await page.route('**/auth/v1/logout*', async (route) => {
      await route.fulfill({
        status: 204,
        contentType: 'application/json',
        body: '',
      });
    });

    await page.addInitScript((storedSession) => {
      localStorage.setItem('onemil-auth', JSON.stringify(storedSession));
    }, session);

    await page.goto('/reset-password');

    await expect(page.getByRole('heading', { name: 'Nastavte nové heslo' })).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('reset-password').fill('CustomerReset123!');
    await page.getByTestId('reset-confirm').fill('CustomerReset123!');
    await page.getByTestId('reset-update-submit').click();

    await expect(page).toHaveURL(/\/login$/, { timeout: 10_000 });
    expect(updateBody).toContain('CustomerReset123!');
  });
});
