import { test, expect, Page } from '@playwright/test';

/**
 * Verify a Supabase session was written to localStorage.
 * The app configures storageKey: 'onemil-auth' in the Supabase client.
 */
async function expectSessionExists(page: Page): Promise<void> {
  const isLoggedIn = await page.evaluate(() =>
    localStorage.getItem('onemil-auth') !== null,
  );
  expect(isLoggedIn, 'Expected Supabase session in localStorage (onemil-auth) but none found').toBe(true);
}

test.describe('User Registration', () => {
  test('registration form renders required fields with 18+ confirmation and no date of birth', async ({ page }) => {
    await page.goto('/register');

    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#confirmPassword')).toBeVisible();
    // 18+ confirmation checkbox is present …
    await expect(page.locator('#ageConfirm')).toBeVisible();
    // … and the date-of-birth field is gone entirely.
    await expect(page.locator('#dateOfBirth')).toHaveCount(0);
    await expect(page.locator('#terms')).toBeVisible();
    await expect(page.locator('#gdpr')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zaregistrovat se' })).toBeVisible();
  });

  test('registration fails when passwords do not match', async ({ page }) => {
    await page.goto('/register');

    await page.fill('#email', 'mismatch@example.com');
    await page.fill('#password', 'Password123!');
    await page.fill('#confirmPassword', 'DifferentPassword!');
    await page.locator('#ageConfirm').click();
    await page.locator('#terms').click();
    await page.locator('#gdpr').click();
    await page.getByRole('button', { name: 'Zaregistrovat se' }).click();

    await expect(page).toHaveURL('/register');
  });

  test('new user registers and is authenticated', async ({ page }) => {
    const uniqueEmail = `e2e+${Date.now()}@onemil.cz`;
    const password = 'E2eSmoke123!';

    await page.goto('/register');
    await page.fill('#email', uniqueEmail);
    await page.fill('#password', password);
    await page.fill('#confirmPassword', password);

    await page.locator('#ageConfirm').click();
    await page.locator('#terms').click();
    await page.locator('#gdpr').click();

    // Submit and wait for Supabase auth response concurrently
    const [authResponse] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes('/auth/v1/signup'),
        { timeout: 20_000 },
      ),
      page.getByRole('button', { name: 'Zaregistrovat se' }).click(),
    ]);

    // If Supabase rate-limits signup (429) or rejects the email domain (422), skip gracefully
    // rather than failing CI — this test only validates the registration flow, not Supabase capacity.
    if (authResponse.status() === 429 || authResponse.status() === 422) {
      test.skip(true, `Supabase /auth/v1/signup returned HTTP ${authResponse.status()} — likely rate limit or domain block; skipping`);
      return;
    }

    expect(
      authResponse.status(),
      `Supabase /auth/v1/signup returned HTTP ${authResponse.status()}`,
    ).toBeLessThan(400);

    // Register.tsx always calls navigate('/profile') on success — wait to leave /register
    await expect(page).not.toHaveURL(/\/register/, { timeout: 15_000 });

    // Allow 3 s for Supabase to write the session token and React to settle
    await page.waitForTimeout(3_000);

    // Three valid post-registration states:
    //   1. Email auto-confirmed → session in localStorage → bottom nav visible
    //   2. Email confirmation required, session null → Profile redirects to /login
    //   3. Email confirmation required, temp session → DateOfBirthGuard shows confirm-email screen
    const bottomNav = page.getByRole('navigation', { name: 'Hlavní menu' });
    const emailConfirmScreen = page.getByText('Potvrďte svůj e-mail', { exact: false });

    const onLoginPage = page.url().includes('/login');
    const confirmVisible = await emailConfirmScreen.isVisible().catch(() => false);

    if (onLoginPage || confirmVisible) {
      // Registration succeeded but Supabase requires email confirmation — no session expected.
      // Profile.tsx redirected to /login (no session) or DateOfBirthGuard shows confirm screen.
    } else {
      // Email auto-confirmed — session must be in localStorage and app must render navigation.
      await expectSessionExists(page);
      await expect(
        bottomNav,
        'Expected app navigation after auto-confirmed registration',
      ).toBeVisible({ timeout: 5_000 });
    }
  });
});
